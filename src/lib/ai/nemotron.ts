import 'server-only';
import type { FailureDiagnostic } from './diagnostics';
import type { FinalJsonSchema } from './final-schema';
import { LIGHTNING_MODEL, providerRequestOptions, type ProviderRequestMode } from './provider-profile';
export interface ToolDefinition { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }
export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
export interface ModelMessage { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string }
export interface ModelReply { content: string | null; tool_calls?: ToolCall[] }
export class AIError extends Error {
  constructor(public code: 'MODEL_UNAVAILABLE' | 'INVALID_MODEL_OUTPUT' | 'FORBIDDEN' | 'RATE_LIMITED', message: string, public diagnostic?: FailureDiagnostic) { super(message); }
}
export function providerConfig() {
  const apiKey = process.env.NEMOTRON_API_KEY;
  const baseUrl = process.env.NEMOTRON_BASE_URL;
  const model = process.env.NEMOTRON_MODEL;
  if (!apiKey || !baseUrl || !model) throw new AIError('MODEL_UNAVAILABLE', 'Nemotron is not configured');
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new AIError('MODEL_UNAVAILABLE', 'Invalid provider endpoint configuration');
  return { apiKey, endpoint: `${baseUrl.replace(/\/$/, '')}/chat/completions`, model };
}
export async function callNemotron(messages: ModelMessage[], tools: ToolDefinition[], signal: AbortSignal, mode: ProviderRequestMode = 'tools', finalSchema?: FinalJsonSchema): Promise<{ reply: ModelReply; model: string; latencyMs: number }> {
  const config = providerConfig();
  if (mode === 'final_json' && (config.model !== LIGHTNING_MODEL || tools.length)) throw new AIError('INVALID_MODEL_OUTPUT', 'JSON finalization requires exact Lightning and no tools');
  if (finalSchema && mode !== 'final_json') throw new AIError('INVALID_MODEL_OUTPUT', 'Final schema requires tool-free finalization');
  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(config.endpoint, { method: 'POST', signal, headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: config.model, messages, ...(mode === 'final_json' ? {} : { tools, tool_choice: 'auto' }), ...providerRequestOptions(config.model, mode, finalSchema) }) });
  } catch { throw new AIError('MODEL_UNAVAILABLE', 'Nemotron request failed or timed out'); }
  if (!response.ok) throw new AIError(response.status === 429 ? 'RATE_LIMITED' : 'MODEL_UNAVAILABLE', `Nemotron returned HTTP ${response.status}`);
  // Never log provider error bodies, prompts or credentials.
  const text = await response.text();
  if (text.length > 128000) throw new AIError('INVALID_MODEL_OUTPUT', 'Provider response exceeds limit', { stage: 'PROVIDER', reason: 'PROVIDER_TOO_LARGE' });
  let data;
  try { data = JSON.parse(text); } catch { throw new AIError('INVALID_MODEL_OUTPUT', 'Invalid provider JSON', { stage: 'PROVIDER', reason: 'PROVIDER_JSON_INVALID' }); }
  if (data?.choices?.[0]?.finish_reason === 'length') throw new AIError('INVALID_MODEL_OUTPUT', 'Nemotron output was truncated at token limit', { stage: 'PROVIDER', reason: 'PROVIDER_TRUNCATED' });
  const reply = data?.choices?.[0]?.message;
  if (!reply || !(reply.content === null || typeof reply.content === 'string') || reply.tool_calls && (!Array.isArray(reply.tool_calls) || reply.tool_calls.length > 8 || reply.tool_calls.some((c: ToolCall) => typeof c.id !== 'string' || c.type !== 'function' || typeof c.function?.name !== 'string' || typeof c.function?.arguments !== 'string' || c.function.arguments.length > 10000))) throw new AIError('INVALID_MODEL_OUTPUT', 'Invalid provider message', { stage: 'PROVIDER', reason: 'PROVIDER_SCHEMA_INVALID' });
  if (mode === 'final_json' && reply.tool_calls?.length) throw new AIError('INVALID_MODEL_OUTPUT', 'Tool calls are forbidden during JSON finalization', { stage: 'PROVIDER', reason: 'PROVIDER_FINAL_TOOL_CALLS' });
  return { reply, model: config.model, latencyMs: Date.now() - started };
}
