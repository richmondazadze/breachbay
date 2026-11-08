import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OutputValidationError } from '../../src/lib/ai/diagnostics';
import { validateFindings } from '../../src/lib/ai/evidence';
import { validatePlanning } from '../../src/lib/ai/planning';
import { credentialCompromiseScenario } from '../../src/lib/simulation/scenario';
test('finding rejection distinguishes schema, citation and next queries without output text', () => {
  const finding = { summary: 'Sensitive-looking diagnostic test text', confidence: 'LOW', evidenceIds: ['unknown'], unknowns: [] };
  assert.throws(() => validateFindings(null, 'a', []), e => e instanceof OutputValidationError && e.diagnostic.reason === 'FINDINGS_SHAPE_INVALID');
  assert.throws(() => validateFindings([finding], 'a', []), e => e instanceof OutputValidationError && e.diagnostic.reason === 'CITATION_NOT_RETRIEVED' && !e.message.includes(finding.summary));
  assert.throws(() => validatePlanning({assumptions:[],uncertainty:[],alternatives:[{action:{type:'ISOLATE_SIMULATED_HOST',targetIds:['foreign']},rationale:'Synthetic',tradeoffs:[]}]},credentialCompromiseScenario('a')), e => e instanceof OutputValidationError && e.diagnostic.reason === 'PLAN_ALTERNATIVE_INVALID');
});
