/** Scripted provider failures validate control flow only; never evidence of real NVIDIA success. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { investigate, type InvestigationPorts, type InvestigationEvent } from '../../src/lib/ai/investigation';
import { credentialCompromiseScenario } from '../../src/lib/simulation/scenario';
import { AuthError } from '../../src/lib/backend/clerk-token';
const context = { incidentId: 'a', summary: 'Synthetic incident', scenario: credentialCompromiseScenario('a'), evidence: [] };
function ports(events: InvestigationEvent[]): InvestigationPorts {
  return { loadContext: async () => context, persistEvent: async e => { events.push(e); }, submitProposal: async () => { throw new Error('Must not propose'); } };
}
test('provider outage and pre-cancellation never report completion or proposals', async () => {
  const original = globalThis.fetch;
  const previous = { key: process.env.NEMOTRON_API_KEY, base: process.env.NEMOTRON_BASE_URL, model: process.env.NEMOTRON_MODEL };
  process.env.NEMOTRON_API_KEY = 'synthetic-test-placeholder'; process.env.NEMOTRON_BASE_URL = 'https://provider.invalid/v1'; process.env.NEMOTRON_MODEL = 'synthetic-test-model';
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('', { status: 503 }); };
  try {
    for (const signal of [undefined, AbortSignal.abort()]) {
      const events: InvestigationEvent[] = [];
      await assert.rejects(investigate('a', 'Synthetic objective', ports(events), undefined, signal), e => e instanceof Error && 'code' in e && e.code === 'MODEL_UNAVAILABLE');
      assert.deepEqual(events.map(e => e.type), ['run_started', 'run_failed']);
    }
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
    for (const [key, value] of Object.entries({ NEMOTRON_API_KEY: previous.key, NEMOTRON_BASE_URL: previous.base, NEMOTRON_MODEL: previous.model })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
test('backend revocation is preserved without extra writes or inference', async () => {
  const denial = new AuthError('FORBIDDEN', 'Synthetic revoked grant');
  const p: InvestigationPorts = { loadContext: async () => { throw denial; }, persistEvent: async () => { throw new Error('Must not write'); }, submitProposal: async () => { throw new Error('Must not propose'); } };
  await assert.rejects(investigate('a', 'Synthetic objective', p), e => e === denial);
});

test('backend terminal signal aborts in-flight transport without publishing run_failed', async () => {
  const original = globalThis.fetch;
  const previous = { key: process.env.NEMOTRON_API_KEY, base: process.env.NEMOTRON_BASE_URL, model: process.env.NEMOTRON_MODEL };
  process.env.NEMOTRON_API_KEY = 'synthetic-test-placeholder'; process.env.NEMOTRON_BASE_URL = 'https://provider.invalid/v1'; process.env.NEMOTRON_MODEL = 'synthetic-test-model';
  const backend = new AbortController(); let sawAbort = false;
  globalThis.fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
    const signal = init!.signal!;
    signal.addEventListener('abort', () => { sawAbort = true; reject(new Error('Controlled transport abort')); }, { once: true });
    backend.abort();
  });
  try {
    const events: InvestigationEvent[] = [];
    const client = new AbortController();
    await assert.rejects(investigate('a', 'Synthetic objective', ports(events), undefined, AbortSignal.any([client.signal, backend.signal]), backend.signal), e => e instanceof AuthError && e.code === 'DEPENDENCY_UNAVAILABLE');
    assert.equal(sawAbort, true);
    assert.deepEqual(events.map(e => e.type), ['run_started']);
    // Durable cancellation/deadline is backend-owned; no invented success or competing failure event.
    assert(!events.some(e => ['run_failed','run_completed','proposal'].includes(e.type)));
  } finally {
    globalThis.fetch = original;
    for (const [key, value] of Object.entries({ NEMOTRON_API_KEY: previous.key, NEMOTRON_BASE_URL: previous.base, NEMOTRON_MODEL: previous.model })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('already aborted backend signal performs no reads, model requests or writes', async () => {
  await assert.rejects(investigate('a', 'Synthetic objective', { loadContext: async () => { throw new Error('Must not read'); }, persistEvent: async () => { throw new Error('Must not write'); }, submitProposal: async () => { throw new Error('Must not propose'); } }, undefined, undefined, AbortSignal.abort()), e => e instanceof AuthError);
});

test('provider truncation has fixed diagnostic without exposing output body', async () => {
  const { callNemotron } = await import('../../src/lib/ai/nemotron');
  const original = globalThis.fetch;
  const previous = { key: process.env.NEMOTRON_API_KEY, base: process.env.NEMOTRON_BASE_URL, model: process.env.NEMOTRON_MODEL };
  process.env.NEMOTRON_API_KEY = 'synthetic-test-placeholder'; process.env.NEMOTRON_BASE_URL = 'https://provider.invalid/v1'; process.env.NEMOTRON_MODEL = 'synthetic-test-model';
  globalThis.fetch = async () => new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'DO_NOT_EXPOSE_PROVIDER_TEXT'}}]}));
  try {
    await assert.rejects(callNemotron([], [], AbortSignal.timeout(1000)), e => e instanceof Error && 'diagnostic' in e && (e.diagnostic as {reason:string}).reason === 'PROVIDER_TRUNCATED' && !e.message.includes('DO_NOT_EXPOSE'));
  } finally {
    globalThis.fetch = original;
    for (const [key,value] of Object.entries({NEMOTRON_API_KEY:previous.key,NEMOTRON_BASE_URL:previous.base,NEMOTRON_MODEL:previous.model})) { if(value===undefined)delete process.env[key];else process.env[key]=value; }
  }
});
