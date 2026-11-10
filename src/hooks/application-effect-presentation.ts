import type { OperationalResponse } from "@/lib/response/contract";

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue => !!value && typeof value === "object" && !Array.isArray(value);
const version = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const http = (value: unknown) => Number.isInteger(value) && Number(value) >= 100 && Number(value) <= 599 ? Number(value) : null;

/** Present scoped recorded observations without promoting them to current application state. */
export function recordedApplicationEffect(response: OperationalResponse) {
  if (!response.resultJson) return null;
  try {
    const result: unknown = JSON.parse(response.resultJson);
    if (!object(result) || result.kind !== "RESULT" || result.incidentId !== response.incidentId ||
        result.responseId !== response.id || !response.executionId || result.executionId !== response.executionId ||
        result.payloadDigest !== response.payloadDigest || typeof result.observedAt !== "string" ||
        !Number.isFinite(Date.parse(result.observedAt))) return null;
    const observation = object(result.observation) ? result.observation : null;
    const sameInstance = observation?.instanceId === response.instanceId;
    const receipt = object(result.receipt) ? result.receipt : null;
    const receiptMatches = receipt?.instanceId === response.instanceId && receipt.requestId === response.executionId &&
      version(receipt.beforeVersion) && version(receipt.afterVersion) && typeof receipt.applied === "boolean" &&
      receipt.afterVersion === receipt.beforeVersion + (receipt.applied ? 1 : 0);
    return {
      observedAt: result.observedAt,
      loginCode: http(result.loginProbeStatus),
      healthCode: http(result.healthStatus),
      loginEnabled: sameInstance && typeof observation?.loginEnabled === "boolean" ? observation.loginEnabled : null,
      observedVersion: sameInstance && version(observation?.version) ? observation.version : null,
      differentInstance: !!observation && !sameInstance,
      receiptVersions: receiptMatches ? { before: Number(receipt.beforeVersion), after: Number(receipt.afterVersion) } : null,
    };
  } catch { return null; }
}

export function newestApplicationResponses(responses: OperationalResponse[]) {
  return [...responses].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
}
