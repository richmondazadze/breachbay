import assert from 'node:assert/strict';
import { evidenceIndex, actionIndex } from '../../../../spacetimedb/src/report-index';
const evidence={id:'synthetic-evidence',version:2,source:'synthetic',capturedAt:'2026-01-01T00:00:00Z',classification:'SYNTHETIC',sha256:'a'.repeat(64),redactedSha256:'b'.repeat(64),redactedContent:'private content',storageRef:'private reference',stateJson:'private history'};
assert.deepEqual(Object.keys(evidenceIndex([evidence])[0]).sort(),['id','version','source','capturedAt','classification','sha256','redactedSha256'].sort());
const proposal={id:'synthetic-action',version:3,status:'VERIFIED_SUCCESS',action:{type:'ISOLATE_SIMULATED_HOST',targetIds:['host']},rationale:'Synthetic containment',expectedVersion:2,requestedBy:'human',createdAt:evidence.capturedAt,privatePayload:'excluded'};
assert.equal(actionIndex([proposal])[0].type,proposal.action.type);
assert(!JSON.stringify({evidence:evidenceIndex([evidence]),actions:actionIndex([proposal])}).includes('private'));
console.log('PASS explicit report index excludes raw evidence, storage, historical state and private action fields');
