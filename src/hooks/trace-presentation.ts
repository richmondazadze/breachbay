/** Presentation allowlist for already-redacted scoped trace payloads. Never
 * render arbitrary event JSON, objective, prompt, arguments or credentials. */
import { ERROR_CODES, PROVIDER_CALL_EVENT_TYPES, type ErrorCode, type InvestigationStreamEvent, type ProviderCallEventData } from "@/lib/contracts";
export interface TraceCitation { evidenceId: string; version?: number; sha256?: string; excerpt?: string }
export interface TraceDetails {
  toolCallId?: string; argumentsDigest?: string; step?: number; providerLatencyMs?: number;
  distinctToolsCount?: number; failureCode?: string; citations: TraceCitation[];
}
const text = (value: unknown, limit = 200) => typeof value === "string" ? value.slice(0, limit) : undefined;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value) ? value : undefined;
const code = (value: unknown) => ERROR_CODES.includes(value as ErrorCode) ? value as ErrorCode : undefined;
export function traceDetails(json?: string): TraceDetails {
  const empty: TraceDetails = { citations: [] };
  if (!json || json.length > 60000) return empty;
  try {
    const data = JSON.parse(json);
    if (!data || typeof data !== "object" || Array.isArray(data)) return empty;
    const explicitCitations = Array.isArray(data.citations);
    const rows = Array.isArray(data.citations) ? data.citations : Array.isArray(data.result) ? data.result : [];
    return {
      toolCallId: text(data.toolCallId), argumentsDigest: hash(data.argumentsDigest), step: number(data.step),
      providerLatencyMs: number(data.providerLatencyMs),
      distinctToolsCount: number(data.distinctToolsCount) ?? (Array.isArray(data.distinctTools) ? data.distinctTools.length : undefined),
      failureCode: code(data.error?.code) ?? code(data.code),
      citations: rows.slice(0, 50).flatMap((row: unknown) => {
        if (!row || typeof row !== "object") return [];
        const r = row as Record<string, unknown>;
        if (!explicitCitations && !r.evidenceId && !(typeof r.excerpt === "string" && hash(r.sha256) && number(r.version) !== undefined)) return [];
        const evidenceId = text(r.evidenceId) ?? text(r.id);
        if (!evidenceId) return [];
        return [{ evidenceId, version: number(r.version), sha256: hash(r.sha256), excerpt: text(r.excerpt, 2000) }];
      }),
    };
  } catch { return empty; }
}

const integer = (value: unknown, max: number) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max ? value : undefined;
const finishReasons = ["stop", "tool_calls", "length", "content_filter", "function_call", "unknown"] as const;
/** A separate typed provider allowlist. Never reuse citation/result rendering for provider metadata. */
export function providerCallDetails(event: Pick<InvestigationStreamEvent, "type" | "dataJson">): ProviderCallEventData | undefined {
  if (!(PROVIDER_CALL_EVENT_TYPES as readonly string[]).includes(event.type) || !event.dataJson || event.dataJson.length > 60000) return undefined;
  try {
    const data = JSON.parse(event.dataJson);
    if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
    const step = integer(data.step, 7);
    const outcome = event.type === "provider_call_started" ? "started" : event.type === "provider_call_completed" ? "completed" : "failed";
    if (typeof data.providerCallId !== "string" || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(data.providerCallId) || step === undefined || !["tools", "final_json"].includes(data.mode) || data.outcome !== outcome || data.classification !== "SYNTHETIC" || data.monetaryCost !== "UNKNOWN") return undefined;
    if (typeof data.endpoint !== "string" || data.endpoint.length > 500) return undefined;
    const url = new URL(data.endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return undefined;
    if (!["reported", "estimated", "unavailable"].includes(data.usageSource) || outcome === "started" && data.usageSource === "reported") return undefined;
    const durationMs = number(data.durationMs);
    if (outcome !== "started" && (durationMs === undefined || durationMs > 120000)) return undefined;
    const failure = code(data.code);
    if (outcome === "failed" && !failure) return undefined;
    const result: ProviderCallEventData = { providerCallId: data.providerCallId, step, mode: data.mode, endpoint: url.href, classification: "SYNTHETIC", usageSource: data.usageSource, outcome, monetaryCost: "UNKNOWN" };
    if (outcome !== "started") result.durationMs = durationMs;
    if (outcome === "failed") result.code = failure;
    if (outcome !== "started" && finishReasons.includes(data.finishReason)) result.finishReason = data.finishReason;
    if (data.usageSource === "reported" && outcome !== "started") {
      result.promptTokens = integer(data.promptTokens, 10000000);
      result.completionTokens = integer(data.completionTokens, 10000000);
      result.totalTokens = integer(data.totalTokens, 10000000);
      if (result.promptTokens === undefined && result.completionTokens === undefined && result.totalTokens === undefined) return undefined;
    }
    if (data.usageSource !== "unavailable" && data.usageEstimate && typeof data.usageEstimate === "object") {
      const estimate = data.usageEstimate;
      const prompt = integer(estimate.promptTokensUpperBound, 10000000), completion = integer(estimate.completionTokensUpperBound, 10000000), total = integer(estimate.totalTokensUpperBound, 10000000);
      if (prompt !== undefined && completion !== undefined && total === prompt + completion && estimate.method === "UTF8_REQUEST_BYTES_PLUS_OVERHEAD" && estimate.basis === "REQUEST_BUDGET_CEILING") result.usageEstimate = { promptTokensUpperBound: prompt, completionTokensUpperBound: completion, totalTokensUpperBound: total, method: "UTF8_REQUEST_BYTES_PLUS_OVERHEAD", basis: "REQUEST_BUDGET_CEILING" };
    }
    if (data.usageSource === "estimated" && !result.usageEstimate) return undefined;
    return result;
  } catch { return undefined; }
}
