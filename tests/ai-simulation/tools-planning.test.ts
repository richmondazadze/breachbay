import { test } from 'node:test';
import assert from 'node:assert/strict';
import { credentialCompromiseScenario } from '../../src/lib/simulation/scenario';
import { executeInvestigationTool, type InvestigationPorts } from '../../src/lib/ai/investigation';
import { validatePlanning } from '../../src/lib/ai/planning';
import { sanitizeEvidence, validateFindings } from '../../src/lib/ai/evidence';
const scenario = credentialCompromiseScenario('a');
const ctx = { incidentId: 'a', summary: 'Synthetic', scenario, evidence: [] };
const basePorts: InvestigationPorts = { loadContext: async () => ctx, persistEvent: async () => { throw new Error('No writes allowed'); }, submitProposal: async () => { throw new Error('No proposals allowed'); } };
test('action status requires explicit scoped read port and strips extra response fields', async () => {
  await assert.rejects(executeInvestigationTool('get_action_status', { actionId: 'p' }, ctx, basePorts));
  const ports = { ...basePorts, getActionStatus: async (incidentId: string, actionId: string) => ({ incidentId, actionId, status: 'VERIFIED_PARTIAL' as const, version: 2, expectedVersion: 1, privatePayload: 'must-strip', verification: { status: 'VERIFIED_PARTIAL' as const, observedVersion: 2, summary: 'Synthetic verification password=private' } }) };
  const result = await executeInvestigationTool('get_action_status', { actionId: 'p' }, ctx, ports) as Record<string, unknown>;
  assert.equal(result.status, 'VERIFIED_PARTIAL'); assert(!('privatePayload' in result)); assert(!JSON.stringify(result).includes('private'));
  await assert.rejects(executeInvestigationTool('get_action_status', { actionId: 'p', incidentId: 'foreign' }, ctx, ports));
  await assert.rejects(executeInvestigationTool('get_action_status', { actionId: 'p' }, ctx, { ...ports, getActionStatus: async () => ({ incidentId: 'foreign', actionId: 'p', status: 'APPROVED', version: 1, expectedVersion: 1 }) }));
});
test('planning validates alternatives deterministically and bounds recommended queries', () => {
  const plan = validatePlanning({ assumptions: ['Synthetic credential attribution'], uncertainty: ['External spread unknown'], alternatives: [{ action: { type: 'ISOLATE_SIMULATED_HOST', targetIds: ['app-host'] }, rationale: 'Interrupt main route', tradeoffs: ['Customer portal interrupted; alternate path persists'] }] }, scenario);
  assert.equal(plan.alternatives.length, 1);
  assert.throws(() => validatePlanning({ ...plan, alternatives: [{ ...plan.alternatives[0], action: { type: 'ISOLATE_SIMULATED_HOST', targetIds: ['foreign'] } }] }, scenario));
  const e = sanitizeEvidence({ id: 'e', incidentId: 'a', version: 1, synthetic: true, source: 'Synthetic', capturedAt: '2026-11-07T00:00:00Z', fields: { description: 'Synthetic activity' } });
  const finding = { summary: 'Observed synthetic activity', confidence: 'LOW', evidenceIds: ['e'], unknowns: [], recommendedNextQueries: ['Search jump-host activity'] };
  assert.deepEqual(validateFindings([finding], 'a', [e])[0].recommendedNextQueries, finding.recommendedNextQueries);
  assert.throws(() => validateFindings([{ ...finding, recommendedNextQueries: ['x'.repeat(201)] }], 'a', [e]));
});

test('production argument digest identifies legitimate incident scope assertion; foreign scope stays denied', async () => {
  const { toolArgumentsDigest } = await import('../../src/lib/ai/evidence');
  const incidentId = 'inc_928b9e424c3c616caf416a7bd2b75f865ec819bf6c4426dffbeb690584c14854';
  const candidate = JSON.stringify({ incidentId });
  assert.equal(toolArgumentsDigest(candidate), '8fa6cd087ab848cbb4bfbd75078de7c0302533f38f9bd11173bb53af6d361fb3');
  const authorized = { ...ctx, incidentId, scenario: { ...scenario, incidentId } };
  const result = await executeInvestigationTool('get_incident_context', JSON.parse(candidate), authorized, basePorts);
  assert.deepEqual(result, { incidentId, summary: ctx.summary, synthetic: true });
  assert.deepEqual(await executeInvestigationTool('get_incident_context', {}, authorized, basePorts), result);
  await assert.rejects(executeInvestigationTool('get_incident_context', { incidentId: 'foreign' }, authorized, basePorts), e => e instanceof Error && 'code' in e && e.code === 'FORBIDDEN');
  await assert.rejects(executeInvestigationTool('get_incident_context', { incidentId, arbitrary: 'do-not-allow' }, authorized, basePorts));
  // Same assertion works across registry tools but never chooses a different read context.
  const impact = await executeInvestigationTool('calculate_impact', { incidentId }, authorized, basePorts);
  assert.equal(typeof impact, 'object');
});

test('advertised scope assertion const preserves required tool arguments and unknown-key rejection', async () => {
  const { investigationToolDefinitions } = await import('../../src/lib/ai/investigation');
  const definitions = investigationToolDefinitions('a', basePorts);
  for (const d of definitions) {
    const properties = d.function.parameters.properties as Record<string, { const?: string }>;
    assert.equal(properties.incidentId.const, 'a');
    assert.equal(d.function.parameters.additionalProperties, false);
  }
  const search = definitions.find(d => d.function.name === 'search_evidence')!;
  assert.deepEqual(search.function.parameters.required, ['query']);
  const context = definitions.find(d => d.function.name === 'get_incident_context')!;
  assert.deepEqual(context.function.parameters.required, []);
  await assert.rejects(executeInvestigationTool('search_evidence', { incidentId: 'a' }, ctx, basePorts));
  await assert.rejects(executeInvestigationTool('simulate_response', { incidentId: 'foreign', type: 'ISOLATE_SIMULATED_HOST', targetIds: ['workstation'] }, ctx, basePorts));
});

test('empty evidence query retrieves up to 20 approved excerpts without graph citation elevation', async () => {
  const { citationManifest }=await import('../../src/lib/ai/citation-guidance');
  const records=Array.from({length:25},(_,i)=>sanitizeEvidence({id:`e-${i}`,incidentId:'a',version:1,source:'Synthetic',capturedAt:'2026-11-07T00:00:00Z',synthetic:true,fields:{description:'Approved fixture'}}));
  const context={...ctx,evidence:records};
  const result=await executeInvestigationTool('search_evidence',{query:'',incidentId:'a'},context,basePorts) as typeof records;
  assert.equal(result.length,20);
  const manifest=citationManifest(records,new Set(result.map(e=>e.id)),'a');
  assert.equal(manifest.length,20);
  assert(!manifest.some(e=>e.evidenceId==='e-24'));
  assert(!manifest.some(e=>e.evidenceId==='ev-alternate'));
});
