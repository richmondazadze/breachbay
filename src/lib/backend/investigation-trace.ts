import { sanitizeFreeText } from "../ai/evidence";
import { validatedToolArgumentsDigest } from "./tool-digest";
export const RUN_DEADLINE_MS = 120000;
export const terminalRun = (status: string) => ["COMPLETED", "FAILED", "CANCELLED"].includes(status);
export const runDeadlineReached = (createdAt: string, now: number) => Number.isFinite(Date.parse(createdAt)) && now >= Date.parse(createdAt) + RUN_DEADLINE_MS;
export function traceEvidenceIds(result: unknown): string[] {
  if (!Array.isArray(result)) return [];
  return [...new Set(result.flatMap(row => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    return typeof r.evidenceId === "string" ? [r.evidenceId] : typeof r.id === "string" ? [r.id] : [];
  }))];
}
/** Store only bounded synthetic tool output; redact strings and discard credential-bearing keys. */
export function safeTraceJson(value: unknown) {
  function clean(v: unknown, depth: number): unknown {
    if (depth > 12) throw new Error("INVALID_MODEL_OUTPUT");
    if (typeof v === "string") return sanitizeFreeText(v).slice(0, 30000);
    if (typeof v === "number") { if (!Number.isFinite(v)) throw new Error("INVALID_MODEL_OUTPUT"); return v; }
    if (v === null || typeof v === "boolean") return v;
    if (Array.isArray(v)) {if(v.length>200)throw new Error("INVALID_MODEL_OUTPUT");return v.map(x=>clean(x,depth+1));}
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([k])=>!/(password|token|secret|authorization|storageRef|privateKey|arguments)$/i.test(k)).map(([k,x])=>[k,clean(x,depth+1)]));
    return null;
  }
  const encoded=JSON.stringify(clean(value,0));
  if(encoded.length>60000)throw new Error("INVALID_MODEL_OUTPUT");
  return encoded;
}
export function toolTrace(data: Record<string,unknown>) {
  if(typeof data.toolCallId!=="string" || !data.toolCallId || data.toolCallId.length>200)throw new Error("INVALID_MODEL_OUTPUT");
  const latency=data.providerLatencyMs;
  if(latency!==undefined && (typeof latency!=="number" || !Number.isFinite(latency) || latency<0))throw new Error("INVALID_MODEL_OUTPUT");
  return {toolCallId:data.toolCallId,argumentsDigest:validatedToolArgumentsDigest(data.argumentsDigest),providerLatencyMs:latency as number|undefined,resultJson:data.result===undefined?undefined:safeTraceJson(data.result),failureCode:typeof data.code==="string"?data.code.slice(0,100):undefined};
}
