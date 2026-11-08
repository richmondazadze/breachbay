// Actual cancelled-run negative. Existing service identity only; no human token minting.
import assert from 'node:assert/strict';
import {createClerkClient} from '@clerk/backend';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
let phase='configuration';
async function main(){
 const load=async path=>{const m=await import(pathToFileURL(join(process.cwd(),path)).href);return m.default??m;};
 const {connectBackend,snapshotFromConnection,executeCommand}=await load('src/lib/backend/client.ts');
 const {assertServiceSession}=await load('src/lib/backend/service-session-operator.ts');
 const clerk=createClerkClient({secretKey:process.env.CLERK_SECRET_KEY});
 assertServiceSession(await clerk.sessions.getSession(process.env.AI_SERVICE_CLERK_SESSION_ID),process.env.AI_SERVICE_CLERK_USER_ID);
 const token=await clerk.sessions.getToken(process.env.AI_SERVICE_CLERK_SESSION_ID,process.env.CLERK_JWT_TEMPLATE,120);
 const incidentId=process.env.BREACHBAY_CANCEL_INCIDENT_ID,correlationId=process.env.BREACHBAY_CANCEL_CORRELATION_ID;
 assert.ok(incidentId&&correlationId);
 const conn=await connectBackend({endpoint:process.env.SPACETIMEDB_ENDPOINT??process.env.NEXT_PUBLIC_SPACETIMEDB_ENDPOINT,database:process.env.SPACETIMEDB_DATABASE??process.env.NEXT_PUBLIC_SPACETIMEDB_DATABASE,token:token.jwt});
 try{
  phase='canonical cancelled run';
  const before=snapshotFromConnection(conn,incidentId);assert.equal(before?.incident.classification,'SYNTHETIC');
  const started=before.streamEvents.find(e=>e.type==='run_started'&&e.correlationId===correlationId);assert.ok(started);
  const run=before.investigations.find(r=>r.id===started.runId);assert.equal(run?.status,'CANCELLED');
  const events=before.streamEvents.filter(e=>e.runId===run.id);
  assert.equal(events.filter(e=>e.type==='run_cancelled').length,1);
  assert.equal(before.findings.filter(f=>f.investigationId===run.id).length,0);
  assert.equal(before.proposals.filter(p=>p.investigationId===run.id).length,0);
  phase='late event before run deadline';
  assert.ok(Date.now()<Date.parse(run.createdAt)+120000);
  const command={incidentId,runId:run.id,idempotencyKey:randomUUID(),correlationId:randomUUID(),type:'tool_started',provider:'NVIDIA',model:run.model,tool:'get_incident_context',summary:'Synthetic negative: late event after requester cancellation',dataJson:undefined};
  const denied=await executeCommand(conn,command,()=>conn.reducers.recordInvestigationEvent(command));
  assert.equal(denied.ok,false);assert.equal(denied.error.code,'INVALID_TRANSITION');
  assert.ok(Date.now()<Date.parse(run.createdAt)+120000);
  const after=snapshotFromConnection(conn,incidentId);
  assert.equal(after.investigations.find(r=>r.id===run.id)?.status,'CANCELLED');
  assert.equal(after.streamEvents.filter(e=>e.runId===run.id).length,events.length);
  assert.equal(after.findings.filter(f=>f.investigationId===run.id).length,0);
  assert.equal(after.proposals.filter(p=>p.investigationId===run.id).length,0);
  console.log(JSON.stringify({actualRequesterCancellation:true,runId:run.id,retainedEvents:events.length,lateEventDeniedBeforeDeadline:true,denialCode:denied.error.code,lateFindings:0,lateProposals:0}));
 }finally{conn.disconnect();}
}
main().catch(()=>{console.error('FAIL: '+phase+'; no credentials or trace contents output');process.exitCode=1;});
