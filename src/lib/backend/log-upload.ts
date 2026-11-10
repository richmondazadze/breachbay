import { parseLog, LogImportError } from "../evidence/parse-log";
import { LOG_FORMATS, type LogFormat } from "../evidence/log-types";
import { logDerivative } from "../evidence/import-manifest";
import { digestBytes, MAX_EVIDENCE_BYTES } from "./evidence-storage";
import { boundedBody, endpointFailure } from "./endpoint";

export async function evidenceMultipart(request: Request) {
  const body = await boundedBody(request, MAX_EVIDENCE_BYTES + 16384);
  let form: FormData;
  try { form = await new Response(body, { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData(); } catch { throw new Error("INVALID_INPUT"); }
  const incidentId = form.get("incidentId"), file = form.get("file");
  if (typeof incidentId !== "string" || !incidentId || !(file instanceof File) || !file.size || file.size > MAX_EVIDENCE_BYTES) throw new Error("INVALID_INPUT");
  return { form, incidentId, file };
}

export async function prepareLogUpload(form: FormData, incidentId: string, file: File) {
  const format = form.get("logFormat"), sourceHost = form.get("sourceHost"), classification = form.get("classification"), source = form.get("source"), title = form.get("title");
  if (!LOG_FORMATS.includes(format as LogFormat) || !["INTERNAL", "RESTRICTED"].includes(String(classification)) || form.get("modelApproved") !== "false" || typeof source !== "string" || !source.trim() || source.length > 300 || typeof title !== "string" || !title.trim() || title.length > 200) throw new Error("INVALID_INPUT");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const observations = parseLog(bytes, format as LogFormat, typeof sourceHost === "string" ? sourceHost : undefined);
  let redactedContent: string;
  try { redactedContent = logDerivative(incidentId, observations); } catch { throw new LogImportError(undefined, "Split this log into smaller batches. The derivative exceeds the review limit."); }
  return { bytes, observations, redactedContent, sha256: digestBytes(bytes), redactedSha256: digestBytes(Buffer.from(redactedContent)), classification: String(classification), source: source.trim(), title: title.trim() };
}

export function logUploadFailure(error: unknown) {
  if (!(error instanceof LogImportError)) return endpointFailure(error);
  return Response.json({ ok: false, error: { code: "INVALID_INPUT", message: `${error.line ? `Line ${error.line}: ` : ""}${error.message}`, retryable: false }, correlationId: crypto.randomUUID() }, { status: 400, headers: { "Cache-Control": "no-store" } });
}
