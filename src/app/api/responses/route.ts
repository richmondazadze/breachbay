import { authenticatedBackend } from "@/lib/backend/server";
import { enforceOrigin, AuthError } from "@/lib/backend/oidc";
import { boundedBody, commandMeta, commandResponse, endpointFailure, requireScope } from "@/lib/backend/endpoint";
import { executeCommand } from "@/lib/backend/client";
import { committedCommandData } from "@/lib/backend/command-error";
import { executeApplication, operation, previewApplication, signedResponse } from "@/lib/response/local-application";
import { sha256 } from "../../../../spacetimedb/src/hash";
import { canDispatchResponse } from "@/lib/response/authorization";
export const runtime = "nodejs";
export async function POST(request: Request) {
  let conn: Awaited<ReturnType<typeof authenticatedBackend>>["conn"] | undefined;
  try {
    enforceOrigin(request);
    let input: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse((await boundedBody(request, 18000)).toString());
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      input = parsed as Record<string, unknown>;
    } catch { throw new Error("INVALID_INPUT"); }
    if (typeof input.incidentId !== "string" || typeof input.mode !== "string") throw new Error("INVALID_INPUT");
    const { incidentId } = input;
    const auth = await authenticatedBackend(request); conn = auth.conn;
    const snapshot = requireScope(conn, incidentId, auth.session.user.id, input.mode === "register" ? "MANAGE_INCIDENT" : input.mode === "execute" ? "EXECUTE_RESPONSE" : "PROPOSE");
    if (snapshot.incident.scenarioId !== "evidence-driven") throw new Error("INVALID_INPUT");
    if (input.mode === "preview") {
      const { connector, preview } = await previewApplication(incidentId);
      if (!snapshot.assets.some(a => a.id === preview.assetId)) throw new AuthError("NOT_FOUND", "Upload producing-system logs before connecting this application");
      return Response.json({ ok: true, correlationId: crypto.randomUUID(), data: { name: connector.name, preview, ...signedResponse(preview, connector.signingKey) } }, { headers: { "Cache-Control": "no-store" } });
    }
    const m = commandMeta(input);
    if (input.mode === "register") {
      if (typeof input.name !== "string" || typeof input.owner !== "string" || typeof input.criticality !== "string" || typeof input.reason !== "string" || typeof input.proofJson !== "string" || typeof input.signature !== "string" || !Number.isInteger(input.expectedVersion)) throw new Error("INVALID_INPUT");
      const args = { ...m, incidentId, proofJson: input.proofJson, signature: input.signature, name: input.name, owner: input.owner, criticality: input.criticality, reason: input.reason, expectedVersion: Number(input.expectedVersion) };
      return commandResponse(await executeCommand(conn, args, () => conn!.reducers.registerOperationalTarget(args)));
    }
    if (input.mode === "propose") {
      if (typeof input.targetId !== "string" || typeof input.proofJson !== "string" || typeof input.signature !== "string" || typeof input.rationale !== "string" || !Array.isArray(input.evidenceIds) || input.evidenceIds.some(e => typeof e !== "string") || !Number.isInteger(input.expectedTargetVersion)) throw new Error("INVALID_INPUT");
      const args = { ...m, incidentId, targetId: input.targetId, operation: operation(input.operation), expectedTargetVersion: Number(input.expectedTargetVersion), proofJson: input.proofJson, signature: input.signature, evidenceIds: input.evidenceIds as string[], rationale: input.rationale };
      return commandResponse(await executeCommand(conn, args, () => conn!.reducers.proposeOperationalResponse(args)));
    }
    if (input.mode !== "execute" || typeof input.responseId !== "string" || !Number.isInteger(input.expectedVersion)) throw new Error("INVALID_INPUT");
    const args = { ...m, incidentId, responseId: input.responseId, expectedVersion: Number(input.expectedVersion) };
    const claimed = committedCommandData(await executeCommand(conn, args, () => conn!.reducers.claimOperationalResponse(args)));
    const current = requireScope(conn, incidentId, auth.session.user.id, "EXECUTE_RESPONSE");
    const response = current.operationalResponses?.find(r => r.id === claimed.id);
    const target = current.operationalTargets?.find(t => t.id === response?.targetId);
    if (!response || !target) throw new AuthError("NOT_FOUND", "Response state unavailable");
    if (["VERIFIED_SUCCESS", "VERIFIED_FAILED"].includes(response.status)) return commandResponse({ ok: true, correlationId: m.correlationId, data: { id: response.id } });
    const permitted = () => {
      const fresh = requireScope(conn!, incidentId, auth.session.user.id, "EXECUTE_RESPONSE");
      return canDispatchResponse(fresh, response, Date.now());
    };
    const result = await executeApplication(response, target.connectorId, permitted);
    const record = { idempotencyKey: `result:${sha256(result.proofJson)}`, correlationId: m.correlationId, incidentId, responseId: response.id, proofJson: result.proofJson, signature: result.signature };
    return commandResponse(await executeCommand(conn, record, () => conn!.reducers.recordOperationalResult(record)));
  } catch (error) { return endpointFailure(error); } finally { conn?.disconnect(); }
}
