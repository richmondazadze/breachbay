import { authenticatedBackend } from "@/lib/backend/server";
import { enforceOrigin } from "@/lib/backend/oidc";
import { requireScope } from "@/lib/backend/endpoint";
import { evidenceMultipart, prepareLogUpload, logUploadFailure } from "@/lib/backend/log-upload";
export const runtime = "nodejs";
export async function POST(request: Request) {
  let conn: Awaited<ReturnType<typeof authenticatedBackend>>["conn"] | undefined;
  try {
    enforceOrigin(request);
    const auth = await authenticatedBackend(request); conn = auth.conn;
    const { form, incidentId, file } = await evidenceMultipart(request);
    const snapshot = requireScope(conn, incidentId, auth.session.user.id, "ATTACH_EVIDENCE");
    if (snapshot.incident.scenarioId !== "evidence-driven") throw new Error("INVALID_INPUT");
    const prepared = await prepareLogUpload(form, incidentId, file);
    if (snapshot.incident.classification === "RESTRICTED" && prepared.classification !== "RESTRICTED") throw new Error("INVALID_INPUT");
    return Response.json({ ok: true, correlationId: crypto.randomUUID(), data: { eventCount: prepared.observations.length, sha256: prepared.sha256, redactedSha256: prepared.redactedSha256, redactedContent: prepared.redactedContent, capturedAt: prepared.observations.reduce((first, o) => Date.parse(o.timestamp) < Date.parse(first) ? o.timestamp : first, prepared.observations[0].timestamp) } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return logUploadFailure(error); } finally { conn?.disconnect(); }
}
