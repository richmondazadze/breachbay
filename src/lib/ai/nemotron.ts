import 'server-only';
import { randomUUID } from 'node:crypto';
import type { ErrorCode, ProviderCallEventData, ProviderCallEventType } from '../contracts';
import type { FailureDiagnostic } from './diagnostics';
import type { FinalJsonSchema } from './final-schema';
import { LIGHTNING_MODEL, providerRequestOptions, type ProviderRequestMode } from './provider-profile';
import { providerFinishReason, reportedProviderUsage } from './provider-telemetry';
export interface ToolDefinition { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }
export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
export interface ModelMessage { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string }
export interface ModelReply { content: string | null; tool_calls?: ToolCall[] }
export class AIError extends Error {
  constructor(public code: ErrorCode, message: string, public diagnostic?: FailureDiagnostic) { super(message); }
}
export function providerConfig() {
  const apiKey = process.env.NEMOTRON_API_KEY;
  const baseUrl = process.env.NEMOTRON_BASE_URL;
  const model = process.env.NEMOTRON_MODEL;
  if (!apiKey || !baseUrl || !model) throw new AIError('MODEL_UNAVAILABLE', 'Nemotron is not configured');
  let url: URL;
  try { url = new URL(baseUrl); } catch { throw new AIError('MODEL_UNAVAILABLE', 'Invalid provider endpoint configuration'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new AIError('MODEL_UNAVAILABLE', 'Invalid provider endpoint configuration');
  const endpointUrl = new URL(`${baseUrl.replace(/\/$/, '')}/chat/completions`);
  const endpoint = endpointUrl.href;
  if (endpoint.length > 500 || endpointUrl.search || endpointUrl.hash) throw new AIError('MODEL_UNAVAILABLE', 'Invalid provider endpoint configuration');
  return { apiKey, endpoint, model };
}
export interface ProviderCallObserver {
  step: number;
  record(type: ProviderCallEventType, data: ProviderCallEventData, model: string): Promise<void>;
}
export async function callNemotron(messages: ModelMessage[], tools: ToolDefinition[], signal: AbortSignal, mode: ProviderRequestMode = 'tools', finalSchema?: FinalJsonSchema, observer?: ProviderCallObserver): Promise<{ reply: ModelReply; model: string; latencyMs: number; providerCallId: string }> {
  const config = providerConfig();
  if (mode === 'final_json' && (config.model !== LIGHTNING_MODEL || tools.length)) throw new AIError('INVALID_MODEL_OUTPUT', 'JSON finalization requires exact Lightning and no tools');
  if (finalSchema && mode !== 'final_json') throw new AIError('INVALID_MODEL_OUTPUT', 'Final schema requires tool-free finalization');
  if (observer && (!Number.isInteger(observer.step) || observer.step < 0 || observer.step > 7)) throw new AIError('INVALID_INPUT', 'Invalid provider iteration');
  signal.throwIfAborted();
  const providerCallId = randomUUID();
  const base: ProviderCallEventData = { providerCallId, step: observer?.step ?? 0, mode, endpoint: config.endpoint, classification: 'SYNTHETIC', usageSource: 'unavailable', outcome: 'started', monetaryCost: 'UNKNOWN' };
  const body = JSON.stringify({ model: config.model, messages, ...(mode === 'final_json' ? {} : { tools, tool_choice: 'auto' }), ...providerRequestOptions(config.model, mode, finalSchema) });
  // Persist before dispatch. If this is denied, no inference is attempted and no fabricated failure is emitted.
  await observer?.record('provider_call_started', { ...base }, config.model);
  const started = performance.now();
  let usage = reportedProviderUsage(undefined);
  let finishReason: ProviderCallEventData['finishReason'];
  let reply: ModelReply;
  try {
    signal.throwIfAborted();
    // One instrumented dispatch must not silently follow redirects to a different endpoint.
    const response = await fetch(config.endpoint, { method: 'POST', redirect: 'error', signal, headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', 'X-Request-ID': providerCallId }, body });
    if (!response.ok) throw new AIError(response.status === 429 ? 'RATE_LIMITED' : 'MODEL_UNAVAILABLE', `Nemotron returned HTTP ${response.status}`);
    // Never read/log provider error bodies, prompts, request headers or credentials.
    const text = await response.text();
    if (text.length > 128000) throw new AIError('INVALID_MODEL_OUTPUT', 'Provider response exceeds limit', { stage: 'PROVIDER', reason: 'PROVIDER_TOO_LARGE' });
    let data;
    try { data = JSON.parse(text); } catch { throw new AIError('INVALID_MODEL_OUTPUT', 'Invalid provider JSON', { stage: 'PROVIDER', reason: 'PROVIDER_JSON_INVALID' }); }
    usage = reportedProviderUsage(data?.usage);
    finishReason = providerFinishReason(data?.choices?.[0]?.finish_reason);
    if (finishReason === 'length') throw new AIError('INVALID_MODEL_OUTPUT', 'Nemotron output was truncated at token limit', { stage: 'PROVIDER', reason: 'PROVIDER_TRUNCATED' });
    reply = data?.choices?.[0]?.message;
    if (!reply || !(reply.content === null || typeof reply.content === 'string') || reply.tool_calls && (!Array.isArray(reply.tool_calls) || reply.tool_calls.length > 8 || reply.tool_calls.some((c: ToolCall) => typeof c.id !== 'string' || c.type !== 'function' || typeof c.function?.name !== 'string' || typeof c.function?.arguments !== 'string' || c.function.arguments.length > 10000))) throw new AIError('INVALID_MODEL_OUTPUT', 'Invalid provider message', { stage: 'PROVIDER', reason: 'PROVIDER_SCHEMA_INVALID' });
    if (mode === 'final_json' && reply.tool_calls?.length) throw new AIError('INVALID_MODEL_OUTPUT', 'Tool calls are forbidden during JSON finalization', { stage: 'PROVIDER', reason: 'PROVIDER_FINAL_TOOL_CALLS' });
    signal.throwIfAborted();
  } catch (cause) {
    const error = cause instanceof AIError ? cause : new AIError('MODEL_UNAVAILABLE', 'Nemotron request failed or timed out');
    await observer?.record('provider_call_failed', { ...base, ...usage, outcome: 'failed', durationMs: Math.max(0, Math.round(performance.now() - started)), ...(finishReason ? { finishReason } : {}), code: error.code }, config.model);
    throw error;
  }
  const latencyMs = Math.max(0, Math.round(performance.now() - started));
  // Persistence errors here are not provider failures and never cause a second terminal event/retry.
  await observer?.record('provider_call_completed', { ...base, ...usage, outcome: 'completed', durationMs: latencyMs, finishReason }, config.model);
  return { reply, model: config.model, latencyMs, providerCallId };
}
