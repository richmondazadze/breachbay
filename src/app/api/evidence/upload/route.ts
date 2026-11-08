import { authenticatedBackend } from "../../../../lib/backend/server";
import { enforceOrigin, AuthError } from "../../../../lib/backend/oidc";
import { executeCommand } from "../../../../lib/backend/client";
import { boundedBody, commandMeta, commandResponse, endpointFailure, requireScope } from "../../../../lib/backend/endpoint";
import { validateSyntheticUpload, digestBytes, MAX_EVIDENCE_BYTES, storeOriginal } from "../../../../lib/backend/evidence-storage";
export const runtime = "nodejs";
export async function POST(request: Request) {
  let conn: Awaited<ReturnType<typeof authenticatedBackend>>["conn"] | undefined;
  try {
    enforceOrigin(request);
    const auth = await authenticatedBackend(request); conn = auth.conn;
    const body = await boundedBody(request, MAX_EVIDENCE_BYTES + 16384);
    let form: FormData;
    try { form = await new Response(body, {headers:{"Content-Type":request.headers.get("content-type") ?? ""}}).formData(); } catch { throw new Error("INVALID_INPUT"); }
    const incidentId = form.get("incidentId"); const file = form.get("file");
    if (typeof incidentId !== "string" || !(file instanceof File) || !["text/plain", "application/json", "text/csv"].includes(file.type) || form.get("classification") !== "SYNTHETIC" || !["true","false"].includes(String(form.get("modelApproved")))) throw new Error("INVALID_INPUT");
    const snapshot = requireScope(conn, incidentId, auth.session.user.id, "ATTACH_EVIDENCE");
    const meta = commandMeta(Object.fromEntries(["idempotencyKey","correlationId"].map(k=>[k,form.get(k)])));
    const bytes = new Uint8Array(await file.arrayBuffer());
    const {redactedContent,assetIds} = validateSyntheticUpload(bytes,file.type);
    if(assetIds.some(id=>!snapshot.assets.some(asset=>asset.id===id))) throw new Error("INVALID_INPUT");
    const root = process.env.EVIDENCE_STORAGE_DIR;
    if (!root) throw new AuthError("DEPENDENCY_UNAVAILABLE", "Private evidence storage is not configured");
    const sha256 = await storeOriginal(root, incidentId, bytes);
    const captured = form.get("capturedAt");
    const capturedAt = typeof captured === "string" && captured ? captured : new Date(0).toISOString();
    const result = await executeCommand(conn, meta, () => conn!.reducers.attachEvidence({
      ...meta, incidentId, title:String(form.get("title") || "Synthetic uploaded evidence").slice(0,200), source:"Synthetic responder upload", kind:"LOG", classification:"SYNTHETIC", capturedAt,
      sha256, redactedSha256:digestBytes(Buffer.from(redactedContent)), redactedContent, modelApproved:form.get("modelApproved") === "true", assetIds, storageRef:`private-synthetic:${sha256}`,
    }));
    return commandResponse(result);
  } catch(error) {return endpointFailure(error);} finally {conn?.disconnect();}
}
