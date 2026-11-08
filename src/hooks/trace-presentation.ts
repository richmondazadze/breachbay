/** Presentation allowlist for already-redacted scoped trace payloads. Never
 * render arbitrary event JSON, objective, prompt, arguments or credentials. */
export interface TraceCitation { evidenceId: string; version?: number; sha256?: string; excerpt?: string }
export interface TraceDetails {
  toolCallId?: string; argumentsDigest?: string; step?: number; providerLatencyMs?: number;
  distinctToolsCount?: number; failureCode?: string; citations: TraceCitation[];
}
const text = (value: unknown, limit = 200) => typeof value === "string" ? value.slice(0, limit) : undefined;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value) ? value : undefined;
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
      failureCode: text(data.error?.code) ?? text(data.code),
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
