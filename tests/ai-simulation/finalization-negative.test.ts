/** Scripted terminal failures exercise finalization boundaries, never real model-success evidence. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { investigate, type InvestigationEvent, type InvestigationPorts } from '../../src/lib/ai/investigation';
import { callNemotron, type ModelReply } from '../../src/lib/ai/nemotron';
import { LIGHTNING_MODEL } from '../../src/lib/ai/provider-profile';
import { FINAL_RESPONSE_CONTRACT, mayCorrectFinalization } from '../../src/lib/ai/finalization';
import { sanitizeEvidence } from '../../src/lib/ai/evidence';
import { credentialCompromiseScenario } from '../../src/lib/simulation/scenario';
import { AuthError } from '../../src/lib/backend/clerk-token';

const evidence = sanitizeEvidence({ id: 'retrieved', incidentId: 'a', version: 1, source: 'Synthetic', capturedAt: '2026-11-07T00:00:00Z', synthetic: true, fields: { description: 'Synthetic approved record' } });
const context = { incidentId: 'a', summary: 'Synthetic incident', scenario: credentialCompromiseScenario('a'), evidence: [evidence] };
const reads: ModelReply = { content: null, tool_calls: ['search_evidence', 'get_asset_graph', 'calculate_impact'].map((name, index) => ({ id: `read-${index}`, type: 'function', function: { name, arguments: JSON.stringify(name === 'search_evidence' ? { query: '' } : {}) } })) };
const rejected: ModelReply = { content: 'DO_NOT_EXPOSE_REJECTED_PROVIDER_PROSE' };
const finding = { summary: 'Synthetic observation', confidence: 'LOW', evidenceIds: ['retrieved'], unknowns: [], recommendedNextQueries: [] };

type CapturedRequest = { body: Record<string, any>; signal: AbortSignal };
async function scriptedFailures(replies: ModelReply[], run: (events: InvestigationEvent[], requests: CapturedRequest[], ports: InvestigationPorts) => Promise<void>, model = LIGHTNING_MODEL, backend?: AbortController, abortAtRequest?: number, truncatedAtRequest?: number) {
  const original = globalThis.fetch;
  const previous = { NEMOTRON_API_KEY: process.env.NEMOTRON_API_KEY, NEMOTRON_BASE_URL: process.env.NEMOTRON_BASE_URL, NEMOTRON_MODEL: process.env.NEMOTRON_MODEL };
  process.env.NEMOTRON_API_KEY = 'synthetic-test-placeholder'; process.env.NEMOTRON_BASE_URL = 'https://provider.invalid/v1'; process.env.NEMOTRON_MODEL = model;
  const events: InvestigationEvent[] = [], requests: CapturedRequest[] = [];
  globalThis.fetch = async (_url, init) => {
    requests.push({ body: JSON.parse(String(init!.body)), signal: init!.signal! });
    if (requests.length === abortAtRequest) return new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new Error('Controlled transport abort')), { once: true });
      backend!.abort();
    });
    assert(requests.length <= replies.length, 'Unexpected extra inference');
    return new Response(JSON.stringify({ choices: [{ finish_reason: requests.length === truncatedAtRequest ? 'length' : 'stop', message: replies[requests.length - 1] }] }));
  };
  const ports: InvestigationPorts = { loadContext: async () => context, persistEvent: async e => { events.push(e); }, submitProposal: async () => { throw new Error('Must not propose'); } };
  try { await run(events, requests, ports); }
  finally {
    globalThis.fetch = original;
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
}
const diagnosticReason = (reason: string) => (error: unknown) => error instanceof Error && 'diagnostic' in error && (error.diagnostic as { reason: string }).reason === reason;
const noPublishedCandidate = (events: InvestigationEvent[]) => {
  assert(!events.some(e => ['finding', 'proposal', 'run_completed'].includes(e.type)));
  assert(!JSON.stringify(events).includes('DO_NOT_EXPOSE'));
};

test('native JSON correction occurs once without tools, stripping, publication or a fresh deadline', async () => {
  await scriptedFailures([reads, rejected, rejected], async (events, requests, ports) => {
    await assert.rejects(investigate('a', 'Synthetic objective', ports), diagnosticReason('FINAL_JSON_INVALID'));
    assert.equal(requests.length, 3);
    const native = requests[2];
    assert.equal(native.body.response_format.type, 'json_schema');
    assert.equal(native.body.response_format.json_schema.strict, true);
    assert.deepEqual(native.body.response_format.json_schema.schema.required, ['findings', 'planning', 'proposal']);
    assert(!('tools' in native.body)); assert(!('tool_choice' in native.body));
    assert(!('response_format' in requests[0].body));
    assert.equal(native.signal, requests[0].signal);
    assert(!JSON.stringify(native.body.messages).includes(rejected.content!));
    const guidance = native.body.messages.map((m: { content: string }) => m.content).find((content: string) => content?.includes('finalResponseContract'));
    assert(guidance.includes(JSON.stringify(FINAL_RESPONSE_CONTRACT)));
    assert(guidance.includes(evidence.sha256)); assert(guidance.includes('scenarioVersion'));
    assert.equal(events.filter(e => e.type === 'tool_completed').length, 3);
    assert.deepEqual(events.at(-1)!.data.validationCorrections, [{ step: 1, reason: 'FINAL_JSON_INVALID' }]);
    noPublishedCandidate(events);
  });
});

test('finalization tool calls are rejected without executing or counting them', async () => {
  await scriptedFailures([reads, rejected, { content: null, tool_calls: [{ id: 'forbidden-final-tool', type: 'function', function: { name: 'simulate_response', arguments: '{}' } }] }], async (events, requests, ports) => {
    await assert.rejects(investigate('a', 'Synthetic objective', ports), diagnosticReason('PROVIDER_FINAL_TOOL_CALLS'));
    assert.equal(requests.length, 3);
    assert.equal(events.filter(e => e.type === 'tool_started').length, 3);
    assert.equal(events.at(-1)!.data.completedDistinctTools, 3);
    noPublishedCandidate(events);
  });
});

test('native schema rejects fabricated citations without another correction', async () => {
  const invalid = { content: JSON.stringify({ findings: [{ ...finding, evidenceIds: ['graph-only-or-fabricated'] }], proposal: null }) };
  await scriptedFailures([reads, rejected, invalid], async (events, requests, ports) => {
    await assert.rejects(investigate('a', 'Synthetic objective', ports), diagnosticReason('FINAL_SCHEMA_INVALID'));
    assert.equal(requests.length, 3);
    assert.deepEqual(events.at(-1)!.data.validationCorrections, [{ step: 1, reason: 'FINAL_JSON_INVALID' }]);
    noPublishedCandidate(events);
  });
});

test('native JSON still rejects invalid planning and out-of-scope proposal targets before findings publish', async () => {
  for (const [output, reason] of [
    [{ findings: [finding], planning: { assumptions: 'invalid', uncertainty: [], alternatives: [] }, proposal: null }, 'FINAL_SCHEMA_INVALID'],
    [{ findings: [finding], planning: { assumptions: [], uncertainty: [], alternatives: [{ action: { type: 'BLOCK_SIMULATED_ROUTE', targetIds: ['jump-db'] }, rationale: 'Synthetic alternative', tradeoffs: [] }] }, proposal: { type: 'ISOLATE_SIMULATED_HOST', targetIds: ['foreign'] } }, 'FINAL_SCHEMA_INVALID'],
  ] as const) {
    await scriptedFailures([reads, rejected, { content: JSON.stringify(output) }], async (events, requests, ports) => {
      await assert.rejects(investigate('a', 'Synthetic objective', ports), diagnosticReason(reason));
      assert.equal(requests.length, 3);
      noPublishedCandidate(events);
    });
  }
});

test('native JSON still rejects invalid roots and finding shapes without another JSON retry', async () => {
  for (const [output, reason] of [
    [[], 'FINAL_ROOT_INVALID'],
    [{ findings: 'invalid', proposal: null }, 'FINAL_SCHEMA_INVALID'],
  ] as const) {
    await scriptedFailures([reads, rejected, { content: JSON.stringify(output) }], async (events, requests, ports) => {
      await assert.rejects(investigate('a', 'Synthetic objective', ports), diagnosticReason(reason));
      assert.equal(requests.length, 3); noPublishedCandidate(events);
    });
  }
});

test('native finalization still rejects provider truncation without exposing the candidate', async () => {
  await scriptedFailures([reads, rejected, rejected], async (events, requests, ports) => {
    await assert.rejects(investigate('a', 'Synthetic objective', ports), diagnosticReason('PROVIDER_TRUNCATED'));
    assert.equal(requests.length, 3);
    assert.equal(requests[2].body.max_tokens, 4096); noPublishedCandidate(events);
  }, LIGHTNING_MODEL, undefined, undefined, 3);
});

test('last-step, wrong-model and premature final JSON failures cannot enter native correction', async () => {
  assert.equal(mayCorrectFinalization(LIGHTNING_MODEL, 6, 0), true);
  assert.equal(mayCorrectFinalization(LIGHTNING_MODEL, 7, 0), false);
  assert.equal(mayCorrectFinalization(LIGHTNING_MODEL, 2, 1), false);
  assert.equal(mayCorrectFinalization('other-explicit-model', 2, 0), false);
  await scriptedFailures([reads, rejected], async (events, requests, ports) => {
    await assert.rejects(investigate('a', 'Synthetic objective', ports), diagnosticReason('FINAL_JSON_INVALID'));
    assert.equal(requests.length, 2); noPublishedCandidate(events);
  }, 'other-explicit-model');
  await scriptedFailures([rejected], async (events, requests, ports) => {
    await assert.rejects(investigate('a', 'Synthetic objective', ports));
    assert.equal(requests.length, 1); noPublishedCandidate(events);
  });
  const repeatedRead = (step: number): ModelReply => ({ content: null, tool_calls: [{ id: `extra-${step}`, type: 'function', function: { name: 'calculate_impact', arguments: '{}' } }] });
  await scriptedFailures([reads, ...Array.from({ length: 6 }, (_, step) => repeatedRead(step)), rejected], async (events, requests, ports) => {
    await assert.rejects(investigate('a', 'Synthetic objective', ports), diagnosticReason('FINAL_JSON_INVALID'));
    assert.equal(requests.length, 8);
    assert.deepEqual(events.at(-1)!.data.validationCorrections, []); noPublishedCandidate(events);
  });
});

test('backend cancellation during native finalization preserves canonical terminal ownership', async () => {
  const backend = new AbortController();
  await scriptedFailures([reads, rejected], async (events, requests, ports) => {
    await assert.rejects(investigate('a', 'Synthetic objective', ports, undefined, backend.signal, backend.signal), e => e instanceof AuthError);
    assert.equal(requests.length, 3); assert.equal(requests[2].signal.aborted, true);
    assert(!events.some(e => e.type === 'run_failed')); noPublishedCandidate(events);
  }, LIGHTNING_MODEL, backend, 3);
});

test('transport refuses native mode with tools or unsupported model before fetch', async () => {
  await scriptedFailures([], async (_events, requests) => {
    await assert.rejects(callNemotron([], [{ type: 'function', function: { name: 'unexpected', description: 'Synthetic', parameters: {} } }], AbortSignal.timeout(1000), 'final_json'));
    assert.equal(requests.length, 0);
  });
  await scriptedFailures([], async (_events, requests) => {
    await assert.rejects(callNemotron([], [], AbortSignal.timeout(1000), 'final_json'));
    assert.equal(requests.length, 0);
  }, 'other-explicit-model');
});

test('malformed or missing planning shares one schema finalization with JSON parse failures', async () => {
  for (const planning of [{ assumptions: 'DO_NOT_EXPOSE', uncertainty: [], alternatives: [] }, { assumptions: [], alternatives: [] }, undefined]) {
    const invalid = { content: JSON.stringify({ findings: [finding], planning, proposal: null }) };
    await scriptedFailures([reads, invalid, rejected], async (events, requests, ports) => {
      await assert.rejects(investigate('a', 'Synthetic objective', ports), diagnosticReason('FINAL_JSON_INVALID'));
      assert.equal(requests.length, 3);
      assert.equal(requests[2].body.response_format.type, 'json_schema');
      assert.deepEqual(events.at(-1)!.data.validationCorrections, [{ step: 1, reason: 'PLAN_FIELDS_INVALID' }]);
      noPublishedCandidate(events);
    });
  }
});

test('missing proposal planning alternative gets at most one finalization then remains rejected', async () => {
  const incomplete = { content: JSON.stringify({ findings: [finding], planning: { assumptions: [], uncertainty: [], alternatives: [] }, proposal: { type: 'ISOLATE_SIMULATED_HOST', targetIds: ['app-host'] } }) };
  await scriptedFailures([reads, incomplete, incomplete], async (events, requests, ports) => {
    await assert.rejects(investigate('a', 'Synthetic objective', ports), diagnosticReason('PLAN_REQUIRED'));
    assert.equal(requests.length, 3);
    assert.deepEqual(events.at(-1)!.data.validationCorrections, [{ step: 1, reason: 'PLAN_REQUIRED' }]);
    noPublishedCandidate(events);
  });
});

test('existing citation correction and shared finalization never exceed one of each', async () => {
  const invalidCitation = { content: JSON.stringify({ findings: [{ ...finding, evidenceIds: ['fabricated'] }], planning: { assumptions: [], uncertainty: [], alternatives: [] }, proposal: null }) };
  await scriptedFailures([reads, invalidCitation, rejected, rejected], async (events, requests, ports) => {
    await assert.rejects(investigate('a', 'Synthetic objective', ports), diagnosticReason('FINAL_JSON_INVALID'));
    assert.equal(requests.length, 4);
    assert.deepEqual(events.at(-1)!.data.validationCorrections, [{ step: 1, reason: 'CITATION_NOT_RETRIEVED' }, { step: 2, reason: 'FINAL_JSON_INVALID' }]);
    noPublishedCandidate(events);
  });
});

test('structurally valid native schema output still fails identical alternative semantic gate', async () => {
  const sameAction = { type: 'ISOLATE_SIMULATED_HOST', targetIds: ['app-host'] };
  const identical = { content: JSON.stringify({ findings: [finding], planning: { assumptions: [], uncertainty: [], alternatives: [{ action: sameAction, rationale: 'Synthetic duplicate', tradeoffs: [] }] }, proposal: sameAction }) };
  await scriptedFailures([reads, rejected, identical], async (events, requests, ports) => {
    await assert.rejects(investigate('a', 'Synthetic objective', ports), diagnosticReason('PLAN_DISTINCT_ALTERNATIVE_REQUIRED'));
    assert.equal(requests.length, 3); noPublishedCandidate(events);
  });
});

test('distinctness rejection can use one native response but repeated duplicate remains unpublished', async () => {
  const action = { type: 'ISOLATE_SIMULATED_HOST', targetIds: ['app-host'] };
  const identical = { content: JSON.stringify({ findings: [{ ...finding, summary: 'DO_NOT_EXPOSE_REJECTED_DUPLICATE_CANDIDATE' }], planning: { assumptions: [], uncertainty: [], alternatives: [{ action, rationale: 'Synthetic duplicate', tradeoffs: [] }] }, proposal: action }) };
  await scriptedFailures([reads, identical, identical], async (events, requests, ports) => {
    await assert.rejects(investigate('a', 'Synthetic objective', ports), diagnosticReason('PLAN_DISTINCT_ALTERNATIVE_REQUIRED'));
    assert.equal(requests.length, 3);
    assert.equal(requests[2].body.response_format.type, 'json_schema');
    assert(!('tools' in requests[2].body)); assert(!('tool_choice' in requests[2].body));
    assert.equal(requests[2].signal, requests[0].signal);
    const history = JSON.stringify(requests[2].body.messages);
    assert(!history.includes('DO_NOT_EXPOSE_REJECTED_DUPLICATE_CANDIDATE'));
    assert(history.includes('action type or target-ID set'));
    assert(history.includes('independently from the same current scenario version'));
    assert.deepEqual(events.at(-1)!.data.validationCorrections, [{ step: 1, reason: 'PLAN_DISTINCT_ALTERNATIVE_REQUIRED' }]);
    noPublishedCandidate(events);
  });
});

test('distinctness uses target sets rather than reordered arrays and never resets the allowance', async () => {
  const duplicate = { content: JSON.stringify({ findings: [finding], planning: { assumptions: [], uncertainty: [], alternatives: [{ action: { type: 'ISOLATE_SIMULATED_HOST', targetIds: ['jump-host', 'app-host'] }, rationale: 'Synthetic reordered duplicate', tradeoffs: [] }] }, proposal: { type: 'ISOLATE_SIMULATED_HOST', targetIds: ['app-host', 'jump-host'] } }) };
  await scriptedFailures([reads, duplicate, rejected], async (events, requests, ports) => {
    await assert.rejects(investigate('a', 'Synthetic objective', ports), diagnosticReason('FINAL_JSON_INVALID'));
    assert.equal(requests.length, 3);
    assert.deepEqual(events.at(-1)!.data.validationCorrections, [{ step: 1, reason: 'PLAN_DISTINCT_ALTERNATIVE_REQUIRED' }]);
    noPublishedCandidate(events);
  });
});

test('step-five duplicate after JSON finalization remains terminal with the original correction', async () => {
  const action = { type: 'ISOLATE_SIMULATED_HOST', targetIds: ['app-host'] };
  const duplicate = { content: JSON.stringify({ findings: [finding], planning: { assumptions: [], uncertainty: [], alternatives: [{ action, rationale: 'Synthetic duplicate', tradeoffs: [] }] }, proposal: action }) };
  const extra = (step: number): ModelReply => ({ content: null, tool_calls: [{ id: `before-final-${step}`, type: 'function', function: { name: 'calculate_impact', arguments: '{}' } }] });
  await scriptedFailures([reads, extra(1), extra(2), extra(3), rejected, duplicate], async (events, requests, ports) => {
    await assert.rejects(investigate('a', 'Synthetic objective', ports), diagnosticReason('PLAN_DISTINCT_ALTERNATIVE_REQUIRED'));
    assert.equal(requests.length, 6);
    assert.equal(events.at(-1)!.data.step, 5);
    assert.deepEqual(events.at(-1)!.data.validationCorrections, [{ step: 4, reason: 'FINAL_JSON_INVALID' }]);
    noPublishedCandidate(events);
  });
});

test('citation correction plus distinctness finalization is bounded to two total corrections', async () => {
  const action = { type: 'ISOLATE_SIMULATED_HOST', targetIds: ['app-host'] };
  const duplicate = { findings: [finding], planning: { assumptions: [], uncertainty: [], alternatives: [{ action, rationale: 'Synthetic duplicate', tradeoffs: [] }] }, proposal: action };
  const citationFailure = { content: JSON.stringify({ ...duplicate, findings: [{ ...finding, evidenceIds: ['fabricated'] }] }) };
  const identical = { content: JSON.stringify(duplicate) };
  await scriptedFailures([reads, citationFailure, identical, identical], async (events, requests, ports) => {
    await assert.rejects(investigate('a', 'Synthetic objective', ports), diagnosticReason('PLAN_DISTINCT_ALTERNATIVE_REQUIRED'));
    assert.equal(requests.length, 4);
    assert.deepEqual(events.at(-1)!.data.validationCorrections, [{ step: 1, reason: 'CITATION_NOT_RETRIEVED' }, { step: 2, reason: 'PLAN_DISTINCT_ALTERNATIVE_REQUIRED' }]);
    noPublishedCandidate(events);
  });
});

test('distinctness does not create last-step or wrong-model finalization', async () => {
  const action = { type: 'ISOLATE_SIMULATED_HOST', targetIds: ['app-host'] };
  const duplicate = { content: JSON.stringify({ findings: [finding], planning: { assumptions: [], uncertainty: [], alternatives: [{ action, rationale: 'Synthetic duplicate', tradeoffs: [] }] }, proposal: action }) };
  await scriptedFailures([reads, duplicate], async (events, requests, ports) => {
    await assert.rejects(investigate('a', 'Synthetic objective', ports), diagnosticReason('PLAN_DISTINCT_ALTERNATIVE_REQUIRED'));
    assert.equal(requests.length, 2);
    assert.deepEqual(events.at(-1)!.data.validationCorrections, []); noPublishedCandidate(events);
  }, 'other-explicit-model');
  const extra = (step: number): ModelReply => ({ content: null, tool_calls: [{ id: `last-step-${step}`, type: 'function', function: { name: 'calculate_impact', arguments: '{}' } }] });
  await scriptedFailures([reads, ...Array.from({ length: 6 }, (_, step) => extra(step)), duplicate], async (events, requests, ports) => {
    await assert.rejects(investigate('a', 'Synthetic objective', ports), diagnosticReason('PLAN_DISTINCT_ALTERNATIVE_REQUIRED'));
    assert.equal(requests.length, 8);
    assert.deepEqual(events.at(-1)!.data.validationCorrections, []); noPublishedCandidate(events);
  });
});

test('foreign proposal or alternative targets never enter the distinctness correction', async () => {
  for (const [proposal, alternative, reason] of [
    [{ type: 'ISOLATE_SIMULATED_HOST', targetIds: ['foreign'] }, { type: 'BLOCK_SIMULATED_ROUTE', targetIds: ['jump-db'] }, 'VALIDATION_REJECTED'],
    [{ type: 'ISOLATE_SIMULATED_HOST', targetIds: ['app-host'] }, { type: 'BLOCK_SIMULATED_ROUTE', targetIds: ['foreign'] }, 'PLAN_ALTERNATIVE_INVALID'],
  ] as const) {
    const invalid = { content: JSON.stringify({ findings: [finding], planning: { assumptions: [], uncertainty: [], alternatives: [{ action: alternative, rationale: 'Synthetic invalid target', tradeoffs: [] }] }, proposal }) };
    await scriptedFailures([reads, invalid], async (events, requests, ports) => {
      await assert.rejects(investigate('a', 'Synthetic objective', ports), diagnosticReason(reason));
      assert.equal(requests.length, 2);
      assert.deepEqual(events.at(-1)!.data.validationCorrections, []); noPublishedCandidate(events);
    });
  }
});
