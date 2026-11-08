/** Structural schema controls only; no provider inference or model-success fixture. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finalResponseSchema, providerTransportSchema, validateFinalResponseSchema } from '../../src/lib/ai/final-schema';
import { OutputValidationError } from '../../src/lib/ai/diagnostics';
import { sanitizeEvidence } from '../../src/lib/ai/evidence';
import { credentialCompromiseScenario } from '../../src/lib/simulation/scenario';
import { LIGHTNING_MODEL, providerRequestOptions } from '../../src/lib/ai/provider-profile';
import { validatePlanning } from '../../src/lib/ai/planning';
// Use the installed standard JSON Schema validator, independently of the local subset checker.
const { validate: validateJsonSchema } = require('next/dist/compiled/schema-utils3') as { validate(schema: unknown, value: unknown): void };
const evidence = (id: string, incidentId = 'a') => sanitizeEvidence({ id, incidentId, version: 1, source: 'Synthetic', capturedAt: '2026-11-07T00:00:00Z', synthetic: true, fields: { description: 'EXCERPT_MUST_NOT_ENTER_SCHEMA' } });
const scenario = credentialCompromiseScenario('a');
const format = finalResponseSchema(scenario, [evidence('retrieved'), evidence('not-retrieved'), evidence('foreign', 'b')], new Set(['retrieved', 'foreign', 'graph-only-reference']));
const structuralControl = () => ({ findings: [{ summary: 'Synthetic structural control', confidence: 'LOW', evidenceIds: ['retrieved'], unknowns: [], recommendedNextQueries: [] }], planning: { assumptions: [], uncertainty: [], alternatives: [{ action: { type: 'BLOCK_SIMULATED_ROUTE', targetIds: ['jump-db'] }, rationale: 'Synthetic alternative', tradeoffs: [] }] }, proposal: { type: 'ISOLATE_SIMULATED_HOST', targetIds: ['app-host'] } });
const fixedFailure = (error: unknown) => error instanceof OutputValidationError && error.diagnostic.stage === 'FINAL_JSON' && error.diagnostic.reason === 'FINAL_SCHEMA_INVALID' && !error.message.includes('DO_NOT_EXPOSE');

test('schema contains only retrieved scoped IDs and correct synthetic target categories', () => {
  const encoded = JSON.stringify(format);
  for (const excluded of ['not-retrieved', 'foreign', 'graph-only-reference', 'EXCERPT_MUST_NOT_ENTER_SCHEMA', 'portal-app']) assert(!encoded.includes(excluded));
  assert(encoded.includes('retrieved')); assert(encoded.includes('app-host')); assert(encoded.includes('jump-db'));
  assert.equal(format.strict, true);
  assert.deepEqual(format.schema.required, ['findings', 'planning', 'proposal']);
  assert.equal(format.schema.additionalProperties, false);
});

test('structural checker accepts complete scoped controls and preserves null without mutation', () => {
  const control = structuralControl(), original = JSON.stringify(control);
  validateFinalResponseSchema(control, format);
  assert.equal(JSON.stringify(control), original);
  const insufficient = { ...control, planning: { assumptions: [], uncertainty: [], alternatives: [] }, proposal: null };
  validateFinalResponseSchema(insufficient, format);
});

test('string bounds count Unicode code points without normalization or output repair', () => {
  // JSON Schema counts code points: supplementary characters count once, combining marks separately.
  const accepted = ['\u{1F512}'.repeat(201), '\u{1F512}'.repeat(400), 'x'.repeat(400), 'e\u0301'.repeat(200)];
  for (const summary of accepted) {
    const value = structuralControl(); value.findings[0].summary = summary;
    const parsed = JSON.parse(JSON.stringify(value)), before = JSON.stringify(parsed);
    validateFinalResponseSchema(parsed, format);
    assert.equal(JSON.stringify(parsed), before);
  }
  for (const summary of ['', '\u{1F512}'.repeat(401), 'x'.repeat(401), 'e\u0301'.repeat(201)]) {
    const value = structuralControl(); value.findings[0].summary = summary;
    const before = JSON.stringify(value);
    assert.throws(() => validateFinalResponseSchema(value, format), fixedFailure);
    assert.equal(JSON.stringify(value), before);
  }
});

test('missing fields, malformed planning arrays, aliases and unsupported fields are rejected without repair', () => {
  const mutations: ((value: any) => void)[] = [
    v => { delete v.planning; }, v => { delete v.proposal; }, v => { delete v.findings; },
    v => { delete v.findings[0].recommendedNextQueries; }, v => { delete v.findings[0].unknowns; },
    v => { delete v.planning.assumptions; }, v => { delete v.planning.uncertainty; }, v => { delete v.planning.alternatives; },
    v => { v.planning.assumptions = 'DO_NOT_EXPOSE'; }, v => { v.planning.uncertainty = null; }, v => { v.planning.alternatives = {}; },
    v => { v.planning.uncertainties = v.planning.uncertainty; delete v.planning.uncertainty; },
    v => { delete v.planning.alternatives[0].tradeoffs; }, v => { delete v.planning.alternatives[0].rationale; },
    v => { delete v.proposal.targetIds; }, v => { delete v.proposal.type; },
    v => { v.planning.extra = 'DO_NOT_EXPOSE'; }, v => { v.proposal.expectedVersion = 1; },
    v => { v.findings[0].confidence = 'CERTAIN'; },
  ];
  for (const mutate of mutations) {
    const value = structuralControl(); mutate(value);
    const before = JSON.stringify(value);
    assert.throws(() => validateFinalResponseSchema(value, format), fixedFailure);
    assert.equal(JSON.stringify(value), before);
  }
});

test('bounded arrays, text, citations and per-action target enums reject invalid values', () => {
  const mutations: ((value: any) => void)[] = [
    v => { v.findings = []; }, v => { v.findings.push(v.findings[0], v.findings[0]); },
    v => { v.findings[0].summary = 'x'.repeat(401); },
    v => { v.findings[0].evidenceIds = ['not-retrieved']; }, v => { v.findings[0].evidenceIds = ['retrieved', 'retrieved']; },
    v => { v.findings[0].recommendedNextQueries = ['one', 'two', 'three']; }, v => { v.findings[0].unknowns = ['one', 'two', 'three']; },
    v => { v.planning.assumptions = ['one', 'two', 'three']; }, v => { v.planning.uncertainty = ['one', 'two', 'three']; },
    v => { v.planning.alternatives.push(v.planning.alternatives[0]); }, v => { v.planning.alternatives[0].tradeoffs = ['one', 'two', 'three']; },
    v => { v.proposal.targetIds = []; }, v => { v.proposal.targetIds = ['foreign']; }, v => { v.proposal.targetIds = ['jump-db']; },
    v => { v.proposal.type = 'BLOCK_SIMULATED_ROUTE'; }, v => { v.proposal.targetIds = ['app-host', 'app-host']; },
    v => { v.planning.alternatives[0].action.targetIds = ['portal-app']; },
  ];
  for (const mutate of mutations) { const value = structuralControl(); mutate(value); assert.throws(() => validateFinalResponseSchema(value, format), fixedFailure); }
});

test('unretrieved or foreign-only evidence cannot generate a satisfiable citation schema', () => {
  for (const records of [[], [evidence('foreign', 'b')], [evidence('not-retrieved')]]) {
    assert.throws(() => finalResponseSchema(scenario, records, new Set(['foreign'])), e => e instanceof OutputValidationError && e.diagnostic.reason === 'NO_FINDINGS');
  }
  assert.throws(() => finalResponseSchema({ ...scenario, synthetic: false } as any, [evidence('retrieved')], new Set(['retrieved'])));
});

test('strict schema request options remain exact-Lightning and tool-free only', () => {
  const options = providerRequestOptions(LIGHTNING_MODEL, 'final_json', format);
  assert.deepEqual(options.response_format, { type: 'json_schema', json_schema: providerTransportSchema(format) });
  assert.equal(options.max_tokens, 4096);
  assert(!('response_format' in providerRequestOptions(LIGHTNING_MODEL, 'tools', format)));
  assert.deepEqual(providerRequestOptions('other-explicit-model', 'final_json', format), providerRequestOptions('other-explicit-model'));
});

test('native generation schema preserves null and accepts every distinct action-type pairing', () => {
  const transport = providerTransportSchema(format);
  const insufficient = { ...structuralControl(), planning: { assumptions: [], uncertainty: [], alternatives: [] }, proposal: null };
  validateJsonSchema(transport.schema, insufficient);
  validateFinalResponseSchema(insufficient, format);
  validateJsonSchema(transport.schema, { ...structuralControl(), proposal: null });
  const actions = [
    { type: 'ISOLATE_SIMULATED_HOST', targetIds: ['app-host'] },
    { type: 'RESET_SIMULATED_CREDENTIAL', targetIds: ['workstation'] },
    { type: 'BLOCK_SIMULATED_ROUTE', targetIds: ['ws-jump'] },
  ];
  for (const proposal of actions) for (const alternative of actions.filter(action => action.type !== proposal.type)) {
    const value = structuralControl(); value.proposal = proposal; value.planning.alternatives[0].action = alternative;
    const original = JSON.stringify(value);
    validateJsonSchema(transport.schema, value);
    validateFinalResponseSchema(value, format);
    validatePlanning(value.planning, scenario);
    assert.equal(JSON.stringify(value), original);
  }
});

test('native generation schema rejects same-type alternatives and missing alternatives without repair', () => {
  const transport = providerTransportSchema(format);
  for (const [type, first, second] of [
    ['ISOLATE_SIMULATED_HOST', 'app-host', 'workstation'],
    ['RESET_SIMULATED_CREDENTIAL', 'workstation', 'app-host'],
    ['BLOCK_SIMULATED_ROUTE', 'ws-jump', 'jump-db'],
  ]) {
    for (const target of [first, second]) {
      const value = structuralControl(); value.proposal = { type, targetIds: [first] };
      value.planning.alternatives[0].action = { type, targetIds: [target] };
      const original = JSON.stringify(value);
      // Local structural/runtime planning rules remain broader than the conservative generation subset.
      validateFinalResponseSchema(value, format);
      validatePlanning(value.planning, scenario);
      assert.throws(() => validateJsonSchema(transport.schema, value));
      assert.equal(JSON.stringify(value), original);
    }
  }
  const noAlternative = structuralControl(); noAlternative.planning.alternatives = [];
  assert.throws(() => validateJsonSchema(transport.schema, noAlternative));
});

test('native proposal branches preserve complete strict objects, scoped IDs and bounded schema size', () => {
  const transport = providerTransportSchema(format), value = structuralControl();
  assert(JSON.stringify(transport).length <= 50000);
  const inspect = (node: any) => {
    if (node.type === 'object') {
      assert.equal(node.additionalProperties, false);
      assert.deepEqual(node.required, Object.keys(node.properties));
    }
    Object.values(node.properties ?? {}).forEach(inspect);
    if (node.items) inspect(node.items);
    (node.anyOf ?? []).forEach(inspect);
  };
  inspect(transport.schema);
  for (const mutate of [
    (v: typeof value) => { v.findings[0].evidenceIds = ['foreign']; },
    (v: typeof value) => { v.proposal.targetIds = ['ws-jump']; },
    (v: typeof value) => { v.planning.alternatives[0].action.targetIds = ['portal-app']; },
    (v: any) => { v.planning.extra = true; },
  ]) {
    const invalid = structuralControl(); mutate(invalid);
    assert.throws(() => validateJsonSchema(transport.schema, invalid));
  }
});

test('immutable transport adapter preserves base constraints while adding proposal-type branches', () => {
  const frozen = structuredClone(format);
  const deepFreeze = (value: any): any => { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };
  deepFreeze(frozen);
  const original = JSON.stringify(frozen);
  const transport = providerTransportSchema(frozen);
  assert.notEqual(transport, frozen); assert.notEqual(transport.schema, frozen.schema);
  assert.equal(JSON.stringify(frozen), original);
  const changes: string[] = [];
  const compare = (before: any, after: any, path = '') => {
    if (!before || typeof before !== 'object') { assert.deepEqual(after, before, path); return; }
    const expectedKeys = Object.keys(before).filter(key => key !== 'uniqueItems');
    assert.deepEqual(Object.keys(after), expectedKeys, path);
    for (const key of Object.keys(before)) {
      if (key === 'uniqueItems') { assert.equal(before[key], true); changes.push(`${path}/uniqueItems`); }
      else compare(before[key], after[key], `${path}/${key}`);
    }
  };
  const baseTransport = { ...transport, schema: { ...transport.schema } };
  delete baseTransport.schema.anyOf;
  compare(frozen, baseTransport);
  assert.equal(transport.schema.anyOf?.length, 4);
  assert(changes.length > 0);
  assert(!JSON.stringify(transport).includes('"uniqueItems":'));
});

test('local citation and action uniqueness still rejects duplicates after request adapter runs', () => {
  const full = finalResponseSchema(scenario, [evidence('retrieved'), evidence('second')], new Set(['retrieved', 'second']));
  const original = JSON.stringify(full);
  providerRequestOptions(LIGHTNING_MODEL, 'final_json', full);
  assert.equal(JSON.stringify(full), original);
  const repeatedCitation = structuralControl(); repeatedCitation.findings[0].evidenceIds = ['retrieved', 'retrieved'];
  assert.throws(() => validateFinalResponseSchema(repeatedCitation, full), fixedFailure);
  const repeatedAction = structuralControl(); repeatedAction.proposal.targetIds = ['app-host', 'app-host'];
  assert.throws(() => validateFinalResponseSchema(repeatedAction, full), fixedFailure);
});
