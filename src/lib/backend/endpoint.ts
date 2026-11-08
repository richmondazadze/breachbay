import type { CommandMeta, CommandResult, Capability } from "../contracts";
import { AuthError } from "./oidc";
import { authFailure } from "./http";
import { snapshotFromConnection, type DbConnection } from "./client";
export function commandMeta(value: Record<string, unknown>): CommandMeta {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_INPUT");
  if (typeof value.idempotencyKey !== "string" || !value.idempotencyKey.trim() || value.idempotencyKey.length > 128 || typeof value.correlationId !== "string" || !value.correlationId.trim() || value.correlationId.length > 128) throw new Error("INVALID_INPUT");
  if (value.expectedVersion !== undefined && (!Number.isInteger(value.expectedVersion) || Number(value.expectedVersion) < 0)) throw new Error("INVALID_INPUT");
  return { idempotencyKey: value.idempotencyKey, correlationId: value.correlationId, expectedVersion: value.expectedVersion as number | undefined };
}
export function requireScope(conn: DbConnection, incidentId: string, userId: string, capability: Capability) {
  if (!conn.isActive) throw new AuthError("UNAUTHENTICATED", "Backend session expired or disconnected");
  const snapshot = snapshotFromConnection(conn, incidentId);
  if (!snapshot?.memberships.some(m => m.active && m.userId === userId && m.capabilities.includes(capability))) throw new AuthError("FORBIDDEN", "Incident permission denied");
  return snapshot;
}
export function commandResponse(result: CommandResult<{id: string}>) {
  const status = result.ok ? 200 : result.error.code === "FORBIDDEN" ? 403 : result.error.code === "UNAUTHENTICATED" ? 401 : result.error.code === "DEPENDENCY_UNAVAILABLE" ? 503 : result.error.code === "VERSION_CONFLICT" || result.error.code === "IDEMPOTENCY_CONFLICT" ? 409 : 400;
  return Response.json(result, {status, headers: {"Cache-Control":"no-store"}});
}
export function endpointFailure(error: unknown) {
  if (error instanceof AuthError) return authFailure(error);
  return Response.json({ok:false,error:{code: error instanceof Error && error.message === "INVALID_INPUT" ? "INVALID_INPUT" : "DEPENDENCY_UNAVAILABLE",message:"Request could not be completed",retryable: !(error instanceof Error && error.message === "INVALID_INPUT")},correlationId:crypto.randomUUID()}, {status:error instanceof Error && error.message === "INVALID_INPUT" ? 400 : 503,headers:{"Cache-Control":"no-store"}});
}
export async function boundedBody(request: Request, max: number) {
  if (!request.body) throw new Error("INVALID_INPUT");
  const reader = request.body.getReader(); const chunks: Uint8Array[]=[]; let size=0;
  try { while (true) { const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>max) {await reader.cancel(); throw new Error("INVALID_INPUT");} chunks.push(value); } } finally {reader.releaseLock();}
  return Buffer.concat(chunks);
}
