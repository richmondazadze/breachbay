// Read-only proof of an intentional provider-disabled rehearsal. No inference or human-token minting.
import assert from 'node:assert/strict';
import {createClerkClient} from '@clerk/backend';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
let phase='configuration';
async function main(){
 const required=name=>{const value=process.env[name];assert.ok(value);return value;};
 const load=async path=>{const m=await import(pathToFileURL(join(process.cwd(),path)).href);return m.default??m;};
 const {connectBackend,snapshotFromConnection}=await load('src/lib/backend/client.ts');
 const {assertServiceSession}=await load('src/lib/backend/service-session-operator.ts');
 const clerk=createClerkClient({secretKey:required('CLERK_SECRET_KEY')});
 const sid=required('AI_SERVICE_CLERK_SESSION_ID');
 assertServiceSession(await clerk.sessions.getSession(sid),required('AI_SERVICE_CLERK_USER_ID'));
 const token=await clerk.sessions.getToken(sid,process.env.CLERK_JWT_TEMPLATE,120);
 const incidentId=required('BREACHBAY_OUTAGE_INCIDENT_ID'),runId=required('BREACHBAY_OUTAGE_RUN_ID');
 const conn=await connectBackend({endpoint:process.env.SPACETIMEDB_ENDPOINT??required('NEXT_PUBLIC_SPACETIMEDB_ENDPOINT'),database:process.env.SPACETIMEDB_DATABASE??required('NEXT_PUBLIC_SPACETIMEDB_DATABASE'),token:token.jwt});
 try{
  const snapshot=snapshotFromConnection(conn,incidentId);
  assert.equal(snapshot?.incident.classification,'SYNTHETIC');
  phase='truthful canonical outage';
  const run=snapshot.investigations.find(r=>r.id===runId);
  assert.equal(run?.status,'FAILED');
  assert.ok(run.objective.startsWith('Intentional provider-disabled rehearsal:'));
  assert.ok(!run.provider&&!run.model);
  const events=snapshot.streamEvents.filter(e=>e.runId===runId);
  assert.equal(events.length,1);assert.equal(events[0].type,'run_failed');
  const failure=JSON.parse(events[0].dataJson);
  assert.equal(failure.code,'RUN_DEADLINE_EXCEEDED');assert.equal(failure.reconciled,true);
  assert.equal(snapshot.toolRuns.filter(t=>t.investigationId===runId).length,0);
  assert.equal(snapshot.findings.filter(f=>f.investigationId===runId).length,0);
  assert.equal(snapshot.proposals.filter(p=>p.investigationId===runId).length,0);
  const began=Date.parse(run.createdAt),ended=Date.parse(run.updatedAt);
  assert.ok(ended>=began+120000);
  phase='service collaboration isolation and manual proposal';
  const during=time=>Date.parse(time)>=began&&Date.parse(time)<=ended;
  // The unchanged module hides human messages/tasks/approvals from AI_SERVICE.
  // Their audit receipts, actual live browser subscriptions and report are separate proof.
  assert.equal(snapshot.messages.length,0);assert.equal(snapshot.tasks.length,0);assert.equal(snapshot.approvals.length,0);
  const proposal=snapshot.proposals.find(p=>p.rationale.startsWith('Manual provider-outage response:')&&during(p.createdAt));
  assert.ok(proposal);
  assert.ok(snapshot.memberships.some(m=>m.userId===proposal.requestedBy&&m.role==='INVESTIGATOR'));
  assert.equal(proposal.investigationId,undefined);
  assert.equal(proposal.action.type,'BLOCK_SIMULATED_ROUTE');
  assert.deepEqual(proposal.action.targetIds,[incidentId+':ws-jump']);
  assert.equal(proposal.expectedVersion,2);
  const preview=snapshot.simulations.find(s=>s.id===proposal.simulationId);
  assert.ok(preview&&preview.parentVersion===2&&preview.payloadDigest===proposal.payloadDigest);
  assert.equal(preview.diff.unresolvedPaths.length,0);
  assert.ok(preview.diff.disruptedServiceIds.includes(incidentId+':customer-portal'));
  console.log(JSON.stringify({actualProviderDisabledTerminal:true,runId,terminal:run.status,failureCode:failure.code,toolCount:0,findingCount:0,aiProposalCount:0,manualProposalId:proposal.id,manualProposalStatus:proposal.status,previewVersion:2,serviceCollaborationIsolation:true,humanMessagesTasksApprovalExecutionAndProviderConfiguration:'SEPARATE_PROOF'}));
 }finally{conn.disconnect();}
}
main().catch(()=>{console.error('FAIL: '+phase+'; no credentials, evidence text or provider body output');process.exitCode=1;});
