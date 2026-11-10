import "server-only";
import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { createHmac } from "node:crypto";
import { canonical, sha256 } from "../../../spacetimedb/src/hash";
import { observedAssetId } from "../evidence/import-manifest";
import { AuthError } from "../backend/clerk-token";
import type { ApplicationObservation, OperationalResponse, RealOperation, ResponsePreview, ResponseReceipt, ResponseResult } from "./contract";
interface Connector {
  id: string; name: string; host: string; endpoint: string;
  controlToken: string; probePassword: string; signingKey: string;
}
export async function localConnector(): Promise<Connector> {
  const file = process.env.BREACHBAY_RESPONSE_CONNECTOR_FILE;
  if (!file || !isAbsolute(file)) throw new AuthError("DEPENDENCY_UNAVAILABLE", "Owned application connector is not configured");
  const bytes = await readFile(/* turbopackIgnore: true */ file);
  if (bytes.length > 8000) throw new AuthError("DEPENDENCY_UNAVAILABLE", "Invalid connector configuration");
  const c = JSON.parse(bytes.toString()) as Connector;
  const url = new URL(c.endpoint);
  if (!/^[a-z][a-z0-9-]{2,60}$/.test(c.id) || !/^[a-z0-9-]{1,63}$/.test(c.host) || typeof c.name !== "string" || c.name.length > 100 || url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash || ![c.controlToken, c.probePassword, c.signingKey].every(s => typeof s === "string" && s.length >= 32 && s.length <= 200)) throw new AuthError("DEPENDENCY_UNAVAILABLE", "Invalid owned loopback connector configuration");
  return { ...c, endpoint: url.origin };
}
export function signedResponse(value: ResponsePreview | ResponseResult, key: string) {
  const proofJson = canonical(value);
  return { proofJson, signature: createHmac("sha256", key).update(proofJson).digest("hex") };
}
function observation(value: unknown): ApplicationObservation {
  const v = value as ApplicationObservation;
  if (!v || !/^[a-f0-9]{48}$/.test(v.instanceId) || !Number.isInteger(v.version) || v.version < 1 || typeof v.loginEnabled !== "boolean" || !Number.isFinite(Date.parse(v.observedAt)) || Math.abs(Date.now() - Date.parse(v.observedAt)) > 60000) throw new AuthError("DEPENDENCY_UNAVAILABLE", "Application returned an invalid current observation");
  return { instanceId: v.instanceId, version: v.version, loginEnabled: v.loginEnabled, observedAt: v.observedAt };
}
async function call(c: Connector, path: string, body?: unknown, control = true) {
  const res = await fetch(c.endpoint + path, { method: body ? "POST" : "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(6000), headers: { ...(control ? { Authorization: `Bearer ${c.controlToken}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await res.text();
  if (text.length > 16000) throw new AuthError("DEPENDENCY_UNAVAILABLE", "Application reply exceeded its limit");
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new AuthError("DEPENDENCY_UNAVAILABLE", "No confirmed application reply"); }
  return { status: res.status, data };
}
export async function previewApplication(incidentId: string): Promise<{ connector: Connector; preview: ResponsePreview }> {
  const connector = await localConnector();
  const reply = await call(connector, "/control/status");
  if (reply.status !== 200) throw new AuthError("DEPENDENCY_UNAVAILABLE", "Application observation unavailable");
  return { connector, preview: { kind: "PREVIEW", incidentId, connectorId: connector.id, assetId: observedAssetId(incidentId, connector.host), observation: observation(reply.data), impact: "Disabling application login invalidates existing application sessions and blocks new logins and authenticated note access. The HTTP health endpoint remains available. Enabling login permits new sessions; revoked sessions remain revoked.", limitation: "This connector controls only this owned local application's single account. It does not establish host isolation, database network containment, or enterprise credential revocation." } };
}
export function applicationRequest(response: OperationalResponse) {
  return { requestId: response.executionId!, operation: response.operation, expectedVersion: response.expectedStateVersion, instanceId: response.instanceId };
}
function validateReceipt(value: unknown, response: OperationalResponse): ResponseReceipt {
  const v = value as ResponseReceipt;
  if (!v || v.requestId !== response.executionId || v.requestDigest !== sha256(canonical(applicationRequest(response))) || typeof v.applied !== "boolean" || !["APPLIED", "VERSION_CONFLICT"].includes(v.code) || v.applied !== (v.code === "APPLIED") || !Number.isInteger(v.beforeVersion) || !Number.isInteger(v.afterVersion) || v.afterVersion !== v.beforeVersion + (v.applied ? 1 : 0) || !/^[a-f0-9]{48}$/.test(v.instanceId) || typeof v.loginEnabled !== "boolean" || !Number.isFinite(Date.parse(v.recordedAt))) throw new AuthError("DEPENDENCY_UNAVAILABLE", "Application execution receipt is invalid");
  return v;
}
/** Crash recovery asks for the durable receipt before dispatching the same effect ID. */
export async function executeApplication(response: OperationalResponse, connectorId: string, dispatch: boolean | (() => boolean)) {
  const c = await localConnector();
  if (c.id !== connectorId || !response.executionId) throw new AuthError("FORBIDDEN", "Response target is not configured");
  let receipt: ResponseReceipt | null = null, current: ApplicationObservation | null = null, health: number | null = null, login: number | null = null;
  try {
    const existing = await call(c, `/control/receipt/${encodeURIComponent(response.executionId)}`);
    if (existing.status === 200) receipt = validateReceipt(existing.data, response);
    else if (existing.status === 404 && (typeof dispatch === "function" ? dispatch() : dispatch)) {
      const applied = await call(c, "/control/access", applicationRequest(response));
      if (applied.status === 200) receipt = validateReceipt(applied.data, response);
    }
    const fresh = await call(c, "/control/status");
    if (fresh.status === 200) current = observation(fresh.data);
    health = (await call(c, "/health", undefined, false)).status;
    login = (await call(c, "/login", { password: c.probePassword }, false)).status;
  } catch { /* Transport/verification outages are unconfirmed, never invented success. */ }
  const desired = response.operation === "ENABLE_APPLICATION_LOGIN";
  const verified = receipt?.applied && receipt.instanceId === response.instanceId && receipt.beforeVersion === response.expectedStateVersion && current?.instanceId === receipt.instanceId && current.version === receipt.afterVersion && current.loginEnabled === desired && health === 200 && login === (desired ? 200 : 403);
  const result: ResponseResult = { kind: "RESULT", incidentId: response.incidentId, responseId: response.id, executionId: response.executionId, payloadDigest: response.payloadDigest, connectorId, status: verified ? "VERIFIED_SUCCESS" : receipt && !receipt.applied ? "VERIFIED_FAILED" : "UNCONFIRMED", receipt, observation: current, healthStatus: health, loginProbeStatus: login, observedAt: new Date().toISOString() };
  return { result, ...signedResponse(result, c.signingKey) };
}
export function operation(value: unknown): RealOperation {
  if (value !== "DISABLE_APPLICATION_LOGIN" && value !== "ENABLE_APPLICATION_LOGIN") throw new Error("INVALID_INPUT");
  return value;
}
