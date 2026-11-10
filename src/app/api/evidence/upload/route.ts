import { authenticatedBackend } from "../../../../lib/backend/server";
import { enforceOrigin, AuthError } from "../../../../lib/backend/oidc";
import { executeCommand } from "../../../../lib/backend/client";
import { commandMeta, commandResponse, requireScope } from "../../../../lib/backend/endpoint";
import { evidenceMultipart, prepareLogUpload, logUploadFailure } from "../../../../lib/backend/log-upload";
import { validateSyntheticUpload, digestBytes, storeOriginal } from "../../../../lib/backend/evidence-storage";
export const runtime = "nodejs";
export async function POST(request: Request) {
  let conn: Awaited<ReturnType<typeof authenticatedBackend>>["conn"] | undefined;
  try {
    enforceOrigin(request);
    const auth = await authenticatedBackend(request); conn = auth.conn;
    const {form, incidentId, file} = await evidenceMultipart(request);
    const snapshot = requireScope(conn, incidentId, auth.session.user.id, "ATTACH_EVIDENCE");
    const meta = commandMeta(Object.fromEntries(["idempotencyKey","correlationId"].map(k=>[k,form.get(k)])));
    const root = process.env.EVIDENCE_STORAGE_DIR;
    if (!root) throw new AuthError("DEPENDENCY_UNAVAILABLE", "Private evidence storage is not configured");
    if (form.get("logFormat")) {
      if (snapshot.incident.scenarioId !== "evidence-driven") throw new Error("INVALID_INPUT");
      const p = await prepareLogUpload(form, incidentId, file);
      if (snapshot.incident.classification === "RESTRICTED" && p.classification !== "RESTRICTED") throw new Error("INVALID_INPUT");
      await storeOriginal(root, incidentId, p.bytes);
      const result = await executeCommand(conn, meta, () => conn!.reducers.ingestLogEvidence({ ...meta, incidentId, title: p.title, source: p.source, classification: p.classification, sha256: p.sha256, redactedSha256: p.redactedSha256, redactedContent: p.redactedContent, observationsJson: JSON.stringify(p.observations), storageRef: `private-evidence:${p.sha256}` }));
      return commandResponse(result);
    }
    if (snapshot.incident.classification !== "SYNTHETIC" || !["text/plain", "application/json", "text/csv"].includes(file.type) || form.get("classification") !== "SYNTHETIC" || !["true","false"].includes(String(form.get("modelApproved")))) throw new Error("INVALID_INPUT");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const {redactedContent,assetIds} = validateSyntheticUpload(bytes,file.type);
    if(assetIds.some(id=>!snapshot.assets.some(asset=>asset.id===id))) throw new Error("INVALID_INPUT");
    const sha256 = await storeOriginal(root, incidentId, bytes);
    const captured = form.get("capturedAt");
    const capturedAt = typeof captured === "string" && captured ? captured : new Date(0).toISOString();
    const result = await executeCommand(conn, meta, () => conn!.reducers.attachEvidence({
      ...meta, incidentId, title:String(form.get("title") || "Synthetic uploaded evidence").slice(0,200), source:"Synthetic responder upload", kind:"LOG", classification:"SYNTHETIC", capturedAt,
      sha256, redactedSha256:digestBytes(Buffer.from(redactedContent)), redactedContent, modelApproved:form.get("modelApproved") === "true", assetIds, storageRef:`private-synthetic:${sha256}`,
    }));
    return commandResponse(result);
  } catch(error) {return logUploadFailure(error);} finally {conn?.disconnect();}
}
