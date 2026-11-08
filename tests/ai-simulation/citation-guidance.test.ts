import { test } from 'node:test';
import assert from 'node:assert/strict';
import { citationManifest, mayCorrectCitation } from '../../src/lib/ai/citation-guidance';
import { OutputValidationError } from '../../src/lib/ai/diagnostics';
import { sanitizeEvidence, validateFindings } from '../../src/lib/ai/evidence';
const evidence = (id:string, incidentId='a') => sanitizeEvidence({id,incidentId,version:1,source:'Synthetic',capturedAt:'2026-11-07T00:00:00Z',synthetic:true,fields:{description:'Approved synthetic excerpt'}});
test('trusted manifest contains only actual retrieved scoped excerpt IDs, never graph refs', () => {
  const records=[evidence('retrieved'),evidence('not-retrieved'),evidence('foreign','b')];
  const manifest=citationManifest(records,new Set(['retrieved','graph-reference-only','foreign']),'a');
  assert.deepEqual(manifest,[{evidenceId:'retrieved',version:1,sha256:records[0].sha256}]);
  const finding={summary:'Synthetic observation',confidence:'LOW',evidenceIds:['graph-reference-only'],unknowns:[],recommendedNextQueries:[]};
  assert.throws(()=>validateFindings([finding],'a',records.filter(e=>manifest.some(m=>m.evidenceId===e.id))),e=>e instanceof OutputValidationError&&e.diagnostic.reason==='CITATION_NOT_RETRIEVED');
});
test('citation correction is at most once and never extends eight-step budget', () => {
  const citationError=new OutputValidationError({stage:'FINDINGS',reason:'CITATION_NOT_RETRIEVED'});
  assert.equal(mayCorrectCitation(citationError,4,0),true);
  assert.equal(mayCorrectCitation(citationError,4,1),false);
  assert.equal(mayCorrectCitation(citationError,7,0),false);
  assert.equal(mayCorrectCitation(new OutputValidationError({stage:'PLANNING',reason:'PLAN_ALTERNATIVE_INVALID'}),2,0),false);
});
