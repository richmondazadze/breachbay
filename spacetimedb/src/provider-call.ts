import { ERROR_CODES, PROVIDER_CALL_EVENT_TYPES, type ProviderCallEventData, type ProviderCallEventType } from "../../src/lib/contracts";

export const isProviderCallEvent = (type: string): type is ProviderCallEventType => (PROVIDER_CALL_EVENT_TYPES as readonly string[]).includes(type);
/** Module V8 has no WHATWG URL constructor. Accept only already-normalized public HTTPS metadata. */
function normalizedEndpoint(value: string) {
  const match = /^https:\/\/([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::([1-9][0-9]{0,4}))?(\/[a-zA-Z0-9._~!$&'()*+,;=:@%/-]*)$/.exec(value);
  if (!match || match[1].length > 253 || match[1].split(".").some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) || match[2] && (Number(match[2]) > 65535 || Number(match[2]) === 443) || /%(?![a-f0-9]{2})/i.test(match[3]) || /\/(?:\.|%2e){1,2}(?:\/|$)/i.test(match[3])) throw new Error("INVALID_INPUT");
  return value;
}
/** Strict metadata validation + explicit projection, shared by gateway and reducer. No provider payloads. */
export function providerCallData(value: unknown, type: ProviderCallEventType): ProviderCallEventData {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_INPUT");
  const v = value as Record<string, unknown>;
  if (typeof v.providerCallId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v.providerCallId) || !Number.isInteger(v.step) || Number(v.step) < 0 || Number(v.step) > 7 || !["tools", "final_json"].includes(String(v.mode))) throw new Error("INVALID_INPUT");
  if (typeof v.endpoint !== "string" || v.endpoint.length > 500) throw new Error("INVALID_INPUT");
  const endpoint = normalizedEndpoint(v.endpoint);
  if (!["SYNTHETIC", "INTERNAL", "RESTRICTED"].includes(String(v.classification)) || !["reported", "estimated", "unavailable"].includes(String(v.usageSource))) throw new Error("INVALID_INPUT");
  const outcome = type === "provider_call_started" ? "started" : type === "provider_call_completed" ? "completed" : "failed";
  if (v.outcome !== outcome || v.monetaryCost !== "UNKNOWN") throw new Error("INVALID_INPUT");
  const out: ProviderCallEventData = { providerCallId: v.providerCallId, step: Number(v.step), mode: v.mode as ProviderCallEventData["mode"], endpoint, classification: v.classification as ProviderCallEventData["classification"], usageSource: v.usageSource as ProviderCallEventData["usageSource"], monetaryCost: "UNKNOWN", outcome };
  if (type !== "provider_call_started") {
    if (typeof v.durationMs !== "number" || !Number.isFinite(v.durationMs) || v.durationMs < 0 || v.durationMs > 120000) throw new Error("INVALID_INPUT");
    out.durationMs = v.durationMs;
  }
  if (type === "provider_call_failed") {
    if (!(ERROR_CODES as readonly unknown[]).includes(v.code)) throw new Error("INVALID_INPUT");
    out.code = v.code as ProviderCallEventData["code"];
  }
  for (const key of ["promptTokens", "completionTokens", "totalTokens"] as const) {
    if (v[key] !== undefined) {
      if (typeof v[key] !== "number" || !Number.isInteger(v[key]) || v[key] < 0 || v[key] > 10000000) throw new Error("INVALID_INPUT");
      out[key] = v[key];
    }
  }
  const hasReported = out.promptTokens !== undefined || out.completionTokens !== undefined || out.totalTokens !== undefined;
  if (hasReported && (type === "provider_call_started" || out.usageSource !== "reported") || out.usageSource === "reported" && !hasReported) throw new Error("INVALID_INPUT");
  if (v.usageEstimate !== undefined) {
    if (!v.usageEstimate || typeof v.usageEstimate !== "object" || Array.isArray(v.usageEstimate)) throw new Error("INVALID_INPUT");
    const estimate = v.usageEstimate as Record<string, unknown>;
    for (const key of ["promptTokensUpperBound", "completionTokensUpperBound", "totalTokensUpperBound"] as const) if (typeof estimate[key] !== "number" || !Number.isInteger(estimate[key]) || estimate[key] < 0 || estimate[key] > 10000000) throw new Error("INVALID_INPUT");
    if (estimate.method !== "UTF8_REQUEST_BYTES_PLUS_OVERHEAD" || estimate.basis !== "REQUEST_BUDGET_CEILING" || Number(estimate.totalTokensUpperBound) !== Number(estimate.promptTokensUpperBound) + Number(estimate.completionTokensUpperBound)) throw new Error("INVALID_INPUT");
    out.usageEstimate = { promptTokensUpperBound: Number(estimate.promptTokensUpperBound), completionTokensUpperBound: Number(estimate.completionTokensUpperBound), totalTokensUpperBound: Number(estimate.totalTokensUpperBound), method: "UTF8_REQUEST_BYTES_PLUS_OVERHEAD", basis: "REQUEST_BUDGET_CEILING" };
  }
  if (out.usageSource === "estimated" && !out.usageEstimate || out.usageSource === "unavailable" && out.usageEstimate) throw new Error("INVALID_INPUT");
  if (v.finishReason !== undefined) {
    if (!["stop", "tool_calls", "length", "content_filter", "function_call", "unknown"].includes(String(v.finishReason))) throw new Error("INVALID_INPUT");
    out.finishReason = v.finishReason as ProviderCallEventData["finishReason"];
  }
  return out;
}
