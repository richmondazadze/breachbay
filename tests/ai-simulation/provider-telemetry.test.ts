/** Scripted transport controls validate metadata/boundaries, never real NVIDIA or operational success. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callNemotron, AIError, type ProviderCallObserver } from '../../src/lib/ai/nemotron';
import { reportedProviderUsage } from '../../src/lib/ai/provider-telemetry';
import { LIGHTNING_MODEL } from '../../src/lib/ai/provider-profile';
import type { ProviderCallEventData, ProviderCallEventType } from '../../src/lib/contracts';
import { AuthError } from '../../src/lib/backend/clerk-token';
import { BackendCommandError } from '../../src/lib/backend/command-error';
import { investigationFailure } from '../../src/lib/ai/http-result';
import { investigate, type InvestigationEvent, type InvestigationPorts } from '../../src/lib/ai/investigation';
import { credentialCompromiseScenario } from '../../src/lib/simulation/scenario';
import { providerCallData } from '../../spacetimedb/src/provider-call';

type Recorded = { type: ProviderCallEventType; data: ProviderCallEventData; model: string };
async function configured(run: () => Promise<void>) {
  const originalFetch = globalThis.fetch;
  const previous = { NEMOTRON_API_KEY: process.env.NEMOTRON_API_KEY, NEMOTRON_BASE_URL: process.env.NEMOTRON_BASE_URL, NEMOTRON_MODEL: process.env.NEMOTRON_MODEL };
  process.env.NEMOTRON_API_KEY = 'CONTROL_SECRET_DO_NOT_PERSIST';
  process.env.NEMOTRON_BASE_URL = 'https://PROVIDER.INVALID:443/v1';
  process.env.NEMOTRON_MODEL = LIGHTNING_MODEL;
  try { await run(); } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
}
const observerFor = (events: Recorded[], step = 0): ProviderCallObserver => ({ step, record: async (type, data, model) => { events.push({ type, data, model }); } });
const response = (extra: Record<string, unknown> = {}) => new Response(JSON.stringify({
  choices: [{ finish_reason: 'stop', message: { content: 'CONTROL_BODY_DO_NOT_PERSIST' } }], ...extra,
}));

test('usage is provider-only, bounded, zero-preserving, and missing/invalid values are unavailable', () => {
  for (const value of [undefined, null, [], 'secret', { prompt_tokens: -1, completion_tokens: 1.5, total_tokens: 10000001 }]) assert.deepEqual(reportedProviderUsage(value), { usageSource: 'unavailable' });
  assert.deepEqual(reportedProviderUsage({ prompt_tokens: 0, completion_tokens: 12, total_tokens: 12, secret: 'never-copy', cost: 7 }), { usageSource: 'reported', promptTokens: 0, completionTokens: 12, totalTokens: 12 });
  assert.deepEqual(reportedProviderUsage({ prompt_tokens: 11, completion_tokens: '7', total_tokens: 10 }), { usageSource: 'reported', promptTokens: 11 });
  assert.deepEqual(reportedProviderUsage({ prompt_tokens: Number.NaN, completion_tokens: Number.POSITIVE_INFINITY }), { usageSource: 'unavailable' });
});

test('each transport call, including tool-free finalization, uses a distinct actual request ID and safe attribution', async () => configured(async () => {
  const events: Recorded[] = [];
  const ids: string[] = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://provider.invalid/v1/chat/completions');
    assert.equal(init?.redirect, 'error');
    assert.equal(events.at(-1)?.type, 'provider_call_started');
    const id = new Headers(init?.headers).get('X-Request-ID')!;
    assert.equal(id, events.at(-1)?.data.providerCallId); ids.push(id);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, LIGHTNING_MODEL); assert.equal(body.max_tokens, 4096);
    return response({ id: 'CONTROL_VENDOR_ID_DO_NOT_PERSIST', usage: { prompt_tokens: 18, completion_tokens: 2, total_tokens: 20, arbitrary: 'CONTROL_USAGE_DO_NOT_PERSIST' } });
  };
  for (const [step, mode] of ['tools', 'final_json'].entries()) {
    const result = await callNemotron([{ role: 'user', content: 'CONTROL_PROMPT_DO_NOT_PERSIST' }], [], AbortSignal.timeout(1000), mode as 'tools' | 'final_json', undefined, observerFor(events, step));
    assert.equal(result.providerCallId, ids[step]);
    assert.equal(result.latencyMs, events.at(-1)?.data.durationMs);
    const terminal = events.at(-1)!;
    assert.equal(terminal.type, 'provider_call_completed');
    assert.equal(terminal.data.usageSource, 'reported');
    assert.equal(terminal.data.totalTokens, 20);
    assert.equal(terminal.data.classification, 'SYNTHETIC');
    assert.equal(terminal.data.mode, mode);
    assert.equal(terminal.model, LIGHTNING_MODEL);
    assert.equal(terminal.data.monetaryCost, 'UNKNOWN');
    assert(!('costEstimateUsd' in terminal.data));
  }
  assert.equal(new Set(ids).size, 2);
  assert(!JSON.stringify(events).includes('CONTROL_'));
  for (const event of events) assert.deepEqual(providerCallData(event.data, event.type), JSON.parse(JSON.stringify(event.data)));
}));

test('HTTP, network, body-read, JSON, size and truncation failures each receive one truthful terminal record', async () => configured(async () => {
  const controls: { fetch: typeof fetch; code: string; usage?: number; finish?: string }[] = [
    { fetch: async () => new Response('CONTROL_ERROR_BODY_DO_NOT_PERSIST', { status: 429 }), code: 'RATE_LIMITED' },
    { fetch: async () => new Response('CONTROL_ERROR_BODY_DO_NOT_PERSIST', { status: 503 }), code: 'MODEL_UNAVAILABLE' },
    { fetch: async () => { throw new Error('CONTROL_NETWORK_DO_NOT_PERSIST'); }, code: 'MODEL_UNAVAILABLE' },
    { fetch: async () => { const r = response(); r.text = async () => { throw new Error('CONTROL_READ_DO_NOT_PERSIST'); }; return r; }, code: 'MODEL_UNAVAILABLE' },
    { fetch: async () => new Response('CONTROL_INVALID_JSON_DO_NOT_PERSIST'), code: 'INVALID_MODEL_OUTPUT' },
    { fetch: async () => new Response('x'.repeat(128001)), code: 'INVALID_MODEL_OUTPUT' },
    { fetch: async () => response({ usage: { prompt_tokens: 4, completion_tokens: 4096, total_tokens: 4100 }, choices: [{ finish_reason: 'length', message: { content: 'CONTROL_TRUNCATED_DO_NOT_PERSIST' } }] }), code: 'INVALID_MODEL_OUTPUT', usage: 4100, finish: 'length' },
  ];
  for (const control of controls) {
    const events: Recorded[] = []; globalThis.fetch = control.fetch;
    await assert.rejects(callNemotron([], [], AbortSignal.timeout(1000), 'tools', undefined, observerFor(events)), e => e instanceof AIError && e.code === control.code && !e.message.includes('CONTROL_'));
    assert.deepEqual(events.map(e => e.type), ['provider_call_started', 'provider_call_failed']);
    const [start, failed] = events;
    assert.equal(start.data.providerCallId, failed.data.providerCallId);
    assert.equal(failed.data.outcome, 'failed'); assert.equal(failed.data.code, control.code);
    assert.equal(failed.data.totalTokens, control.usage);
    assert.equal(failed.data.usageSource, control.usage === undefined ? 'unavailable' : 'reported');
    assert.equal(failed.data.finishReason, control.finish);
    assert(Number.isInteger(failed.data.durationMs) && failed.data.durationMs! >= 0);
    assert(!JSON.stringify(events).includes('CONTROL_'));
    for (const event of events) assert.deepEqual(providerCallData(event.data, event.type), JSON.parse(JSON.stringify(event.data)));
  }
}));

test('denied start/terminal persistence never dispatches or retries inference or fabricates another terminal event', async () => configured(async () => {
  let fetches = 0;
  globalThis.fetch = async () => { fetches++; return response(); };
  const denied = new AuthError('FORBIDDEN', 'Controlled revoked grant');
  await assert.rejects(callNemotron([], [], AbortSignal.timeout(1000), 'tools', undefined, { step: 0, record: async () => { throw denied; } }), e => e === denied);
  assert.equal(fetches, 0);
  const attempted: ProviderCallEventType[] = [];
  await assert.rejects(callNemotron([], [], AbortSignal.timeout(1000), 'tools', undefined, { step: 0, record: async type => { attempted.push(type); if (type === 'provider_call_completed') throw denied; } }), e => e === denied);
  assert.equal(fetches, 1);
  assert.deepEqual(attempted, ['provider_call_started', 'provider_call_completed']);
}));

test('unsafe endpoint and invalid/pre-cancelled iteration gates precede events and fetch', async () => configured(async () => {
  let fetches = 0; globalThis.fetch = async () => { fetches++; return response(); };
  const events: Recorded[] = [];
  for (const base of ['not-a-url', 'http://provider.invalid/v1', 'https://user:pass@provider.invalid/v1', 'https://provider.invalid/v1?secret=CONTROL', 'https://provider.invalid/v1#CONTROL', 'https://provider.invalid/v1?', 'https://provider.invalid/v1#']) {
    process.env.NEMOTRON_BASE_URL = base;
    await assert.rejects(callNemotron([], [], AbortSignal.timeout(1000), 'tools', undefined, observerFor(events)), e => e instanceof AIError && e.code === 'MODEL_UNAVAILABLE' && !e.message.includes('CONTROL'));
  }
  process.env.NEMOTRON_BASE_URL = 'https://provider.invalid/v1';
  await assert.rejects(callNemotron([], [], AbortSignal.timeout(1000), 'tools', undefined, observerFor(events, 8)));
  await assert.rejects(callNemotron([], [], AbortSignal.abort(), 'tools', undefined, observerFor(events)));
  assert.equal(fetches, 0); assert.equal(events.length, 0);
}));

const context = { incidentId: 'a', summary: 'Synthetic incident', scenario: credentialCompromiseScenario('a'), evidence: [] };
const portsFor = (events: InvestigationEvent[]): InvestigationPorts => ({ loadContext: async () => context, persistEvent: async e => { events.push(e); }, submitProposal: async () => { throw new Error('Must not propose'); } });

test('provider telemetry leaves the eight-call budget and one original deadline intact', async () => configured(async () => {
  const events: InvestigationEvent[] = [], signals: AbortSignal[] = []; let calls = 0;
  globalThis.fetch = async (_url, init) => {
    signals.push(init!.signal!); calls++;
    return response({ choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id: `call-${calls}`, type: 'function', function: { name: 'calculate_impact', arguments: '{}' } }] } }] });
  };
  await assert.rejects(investigate('a', 'Synthetic budget control', portsFor(events)), e => e instanceof AIError && e.code === 'INVALID_MODEL_OUTPUT');
  assert.equal(calls, 8); assert(signals.every(s => s === signals[0]));
  const starts = events.filter(e => e.type === 'provider_call_started');
  assert.equal(starts.length, 8); assert.equal(events.filter(e => e.type === 'provider_call_completed').length, 8);
  assert.equal(new Set(starts.map(e => e.data.providerCallId)).size, 8);
  assert.deepEqual(starts.map(e => e.data.step), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(events.at(-1)?.data.failureStage, 'BUDGET');
  assert(!events.some(e => ['finding', 'proposal', 'run_completed'].includes(e.type)));
}));

test('backend cancellation alone aborts body consumption and permits no post-cancel writes', async () => configured(async () => {
  const backend = new AbortController(), events: InvestigationEvent[] = [];
  globalThis.fetch = async (_url, init) => {
    const r = response();
    r.text = async () => new Promise<string>((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new Error('CONTROL_BODY_ABORT')), { once: true });
      backend.abort();
    });
    return r;
  };
  await assert.rejects(investigate('a', 'Synthetic cancellation control', portsFor(events), undefined, undefined, backend.signal), e => e instanceof AuthError);
  assert.deepEqual(events.map(e => e.type), ['run_started', 'provider_call_started']);
}));

test('canonical event-persistence denial is retained after a provider call and does not retry', async () => configured(async () => {
  const events: InvestigationEvent[] = []; let calls = 0;
  globalThis.fetch = async () => { calls++; return response(); };
  const denied = new AIError('VERSION_CONFLICT', 'Reload current scenario before a new investigation');
  const ports = portsFor(events);
  ports.persistEvent = async e => { if (e.type === 'provider_call_completed') throw denied; events.push(e); };
  await assert.rejects(investigate('a', 'Synthetic receipt denial', ports), e => e === denied);
  assert.equal(calls, 1);
  assert.deepEqual(events.map(e => e.type), ['run_started', 'provider_call_started', 'run_failed']);
  assert.equal(events.at(-1)?.data.code, 'VERSION_CONFLICT');
}));

test('typed backend denial survives simultaneous cancellation during terminal persistence with no extra writes', async () => configured(async () => {
  const backend = new AbortController(), events: InvestigationEvent[] = []; let calls = 0;
  globalThis.fetch = async () => { calls++; return response(); };
  const denied = new BackendCommandError('VERSION_CONFLICT');
  const ports = portsFor(events);
  ports.persistEvent = async e => { if (e.type === 'provider_call_completed') { backend.abort(); throw denied; } events.push(e); };
  await assert.rejects(investigate('a', 'Synthetic typed cancellation boundary', ports, undefined, undefined, backend.signal), e => e === denied);
  assert.equal(investigationFailure(denied).status, 409);
  assert.equal(calls, 1);
  assert.deepEqual(events.map(e => e.type), ['run_started', 'provider_call_started']);
}));
