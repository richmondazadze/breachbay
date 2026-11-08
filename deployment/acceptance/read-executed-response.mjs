// Read-only actual canonical execution proof. Human approval/UI and replay tests remain separate.
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
  const {calculateImpact}=await load('src/lib/simulation/engine.ts');
  const clerk=createClerkClient({secretKey:required('CLERK_SECRET_KEY')});
  const sid=required('AI_SERVICE_CLERK_SESSION_ID'),identity=required('AI_SERVICE_CLERK_USER_ID');
  assertServiceSession(await clerk.sessions.getSession(sid),identity);
  const token=await clerk.sessions.getToken(sid,process.env.CLERK_JWT_TEMPLATE,120);
  const incidentId=required('BREACHBAY_EXECUTED_INCIDENT_ID'),proposalId=required('BREACHBAY_EXECUTED_PROPOSAL_ID');
  const conn=await connectBackend({endpoint:process.env.SPACETIMEDB_ENDPOINT??required('NEXT_PUBLIC_SPACETIMEDB_ENDPOINT'),database:process.env.SPACETIMEDB_DATABASE??required('NEXT_PUBLIC_SPACETIMEDB_DATABASE'),token:token.jwt});
  try{
    phase='canonical verified execution';
    const snapshot=snapshotFromConnection(conn,incidentId),actor=[...conn.db.myProfile.iter()][0];
    assert.equal(snapshot?.incident.classification,'SYNTHETIC');
    assert.ok(snapshot.memberships.some(m=>m.active&&m.userId===actor.id&&m.role==='AI_SERVICE'));
    const proposal=snapshot.proposals.find(p=>p.id===proposalId);
    phase='canonical proposal status and versions';
    assert.equal(proposal?.status,'VERIFIED_SUCCESS');
    assert.equal(proposal.action.type,'ISOLATE_SIMULATED_HOST');
    assert.deepEqual(proposal.action.targetIds,[incidentId+':app-host']);
    assert.equal(snapshot.incident.scenarioVersion,proposal.expectedVersion+1);
    const verifications=snapshot.verifications.filter(v=>v.proposalId===proposalId);
    phase='canonical single verification and observed version';
    assert.equal(verifications.length,1);
    const verification=verifications[0];
    assert.equal(verification.status,'VERIFIED_SUCCESS');
    assert.equal(verification.expectedVersion,snapshot.incident.scenarioVersion);
    assert.equal(verification.observedVersion,snapshot.incident.scenarioVersion);
    // Approval records deliberately remain unavailable to AI_SERVICE. Their binding,
    // distinct human actor and execution lifetime must be checked through the human UI/report.
    phase='service approval-record isolation';
    assert.equal(snapshot.approvals.length,0);
    phase='persisted synthetic outcome and residual exposure';
    assert.equal(snapshot.assets.find(a=>a.id===incidentId+':app-host')?.state,'ISOLATED');
    assert.equal(snapshot.assets.find(a=>a.id===incidentId+':customer-portal')?.state,'DEGRADED');
    for(const suffix of ['ws-app','app-db'])assert.equal(snapshot.edges.find(e=>e.id===incidentId+':'+suffix)?.enabled,false);
    for(const suffix of ['ws-jump','jump-db'])assert.equal(snapshot.edges.find(e=>e.id===incidentId+':'+suffix)?.enabled,true);
    const scenario=[...conn.db.scopedScenarios.iter()].find(s=>s.incidentId===incidentId)?.state;
    assert.equal(scenario?.version,snapshot.incident.scenarioVersion);
    const impact=calculateImpact(scenario);
    assert.ok(impact.unresolvedProtectedAssetIds.includes(incidentId+':database'));
    assert.ok(impact.disruptedServiceIds.includes(incidentId+':customer-portal'));
    const branch=snapshot.simulations.find(s=>s.id===proposal.simulationId);
    assert.ok(branch&&branch.parentVersion===proposal.expectedVersion&&branch.payloadDigest===proposal.payloadDigest);
    assert.equal(branch.diff.containmentCoverage,impact.containmentCoverage);
    assert.ok(branch.diff.unresolvedPaths.some(path=>JSON.stringify(path)===JSON.stringify(['workstation','jump-host','database'].map(suffix=>incidentId+':'+suffix))));
    assert.equal(snapshot.scenarioHistory.filter(h=>h.operation==='EXECUTION'&&h.proposalId===proposalId&&h.scenarioVersion===scenario.version).length,1);
    assert.ok(snapshot.scenarioHistory.some(h=>h.scenarioVersion===proposal.expectedVersion));
    console.log(JSON.stringify({actualScopedVerifiedExecution:true,proposalId,scenarioVersion:scenario.version,proposalVersion:proposal.version,verificationId:verification.id,status:verification.status,remainingDatabasePath:true,portalDegraded:true,executionSnapshotCount:1,humanUiAndReplay:'SEPARATE_PROOF'}));
  }finally{conn.disconnect();}
}
main().catch(()=>{console.error('FAIL: '+phase+'; no credentials, evidence or provider bodies output');process.exitCode=1;});
