import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, link, unlink } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { sanitizeFreeText } from "../ai/evidence";
export const MAX_EVIDENCE_BYTES = 256 * 1024;
export function digestBytes(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }
export function deriveSynthetic(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_EVIDENCE_BYTES) throw new Error("INVALID_INPUT");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new Error("INVALID_INPUT"); }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw new Error("INVALID_INPUT");
  return sanitizeFreeText(text).slice(0, 30000);
}
export function validateSyntheticUpload(bytes: Uint8Array, mime: string) {
  const derivative = deriveSynthetic(bytes);
  if (mime !== "application/json") return { redactedContent: derivative, assetIds: [] as string[] };
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder("utf-8", {fatal:true}).decode(bytes)); } catch { throw new Error("INVALID_INPUT"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("INVALID_INPUT");
  const record=parsed as Record<string,unknown>;
  const allowed=["eventType","assetId","sourceAssetId","destinationAssetId","indicator","outcome","description"];
  if (Object.keys(record).some(k=>!allowed.includes(k)) || typeof record.eventType!=="string" || !record.eventType.trim() || typeof record.description!=="string" || !record.description.trim() || Object.values(record).some(v=>typeof v!=="string" || v.length>1500)) throw new Error("INVALID_INPUT");
  const redactedContent=JSON.stringify(Object.fromEntries(Object.entries(record).map(([k,v])=>[k,sanitizeFreeText(v as string)])));
  return {redactedContent,assetIds:[...new Set([record.assetId,record.sourceAssetId,record.destinationAssetId].filter((v):v is string=>typeof v==="string" && v.length>0))]};
}
function objectPath(root: string, incidentId: string, digest: string) {
  if (!isAbsolute(root) || !/^[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid private storage configuration");
  const absolute = resolve(root);
  const project = resolve(process.cwd());
  if (absolute === project || absolute.startsWith(project + "/")) throw new Error("Evidence storage must be outside application tree");
  return join(absolute, digestBytes(Buffer.from(incidentId)), digest);
}
/** Immutable incident-scoped content addressing. Root is operator-owned and never web-served. */
export async function storeOriginal(root: string, incidentId: string, bytes: Uint8Array) {
  const digest = digestBytes(bytes);
  const path = objectPath(root, incidentId, digest);
  await mkdir(join(path, ".."), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, "wx", 0o600);
  try {
    await file.writeFile(bytes); await file.sync(); await file.close();
    try { await link(temporary, path); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  } finally { await file.close().catch(() => {}); await unlink(temporary).catch(() => {}); }
  if (digestBytes(await readFile(path)) !== digest) throw new Error("Stored original integrity mismatch");
  return digest;
}
export async function readOriginal(root: string, incidentId: string, digest: string) {
  const bytes = await readFile(objectPath(root, incidentId, digest));
  if (digestBytes(bytes) !== digest) throw new Error("Stored original integrity mismatch");
  return bytes;
}
