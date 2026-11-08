// Read-only current service-identity telemetry proof; no human token export or provider payloads.
import assert from 'node:assert/strict';
import {createClerkClient} from '@clerk/backend';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

let phase='protected operator configuration';
async function main() {
  const required=name=>{const value=process.env[name];assert.ok(value);return value;};
  const load=async path=>{const module=await import(pathToFileURL(join(process.cwd(),path)).href);return module.default??module;};
  const {connectBackend,snapshotFromConnection}=await load('src/lib/backend/client.ts');
  const {assertServiceSession}=await load('src/lib/backend/service-session-operator.ts');
  // The module package is ESM while shared contracts are CJS under tsx; use its CJS hook.
  const {providerCallData}=require(join(process.cwd(),'spacetimedb/src/provider-call.ts'));
  const {providerConfig}=await load('src/lib/ai/nemotron.ts');
  const config=providerConfig();
  const clerk=createClerkClient({secretKey:required('CLERK_SECRET_KEY')});
  const sessionId=required('AI_SERVICE_CLERK_SESSION_ID');
  assertServiceSession(await clerk.sessions.getSession(sessionId),required('AI_SERVICE_CLERK_USER_ID'));
  const token=await clerk.sessions.getToken(sessionId,process.env.CLERK_JWT_TEMPLATE,120);
  const incidentId=required('BREACHBAY_TELEMETRY_INCIDENT_ID');
  const correlationId=required('BREACHBAY_TELEMETRY_CORRELATION_ID');
  const conn=await connectBackend({endpoint:process.env.SPACETIMEDB_ENDPOINT??required('NEXT_PUBLIC_SPACETIMEDB_ENDPOINT'),database:process.env.SPACETIMEDB_DATABASE??required('NEXT_PUBLIC_SPACETIMEDB_DATABASE'),token:token.jwt});
  try {
    phase='actual scoped canonical run';
    const snapshot=snapshotFromConnection(conn,incidentId);
    const actor=[...conn.db.myProfile.iter()][0];
    assert.equal(snapshot?.incident.classification,'SYNTHETIC');
    assert.ok(snapshot.memberships.some(member=>member.active&&member.role==='AI_SERVICE'&&member.userId===actor.id));
    const terminal=snapshot.streamEvents.find(event=>event.correlationId===correlationId&&['run_completed','run_failed'].includes(event.type));
    assert.ok(terminal);
    const run=snapshot.investigations.find(row=>row.id===terminal.runId);
    assert.ok(run&&['COMPLETED','FAILED'].includes(run.status));
    const events=snapshot.streamEvents.filter(event=>event.runId===run.id&&event.type.startsWith('provider_call_'));
    const starts=events.filter(event=>event.type==='provider_call_started');
    assert.ok(starts.length>0&&starts.length<=8);
    const requestIds=new Set();
    let finalizationCalls=0,failedCalls=0,reportedCalls=0;
    phase='durable provider-call pairing and actual attribution';
    for(const start of starts) {
      const data=providerCallData(JSON.parse(start.dataJson),start.type);
      assert.equal(data.endpoint,config.endpoint);
      assert.equal(data.classification,'SYNTHETIC');
      assert.equal(start.incidentId,incidentId);
      assert.equal(start.provider,'NVIDIA');
      assert.equal(start.model,config.model);
      assert.equal(start.correlationId,correlationId);
      assert.ok(!requestIds.has(data.providerCallId));requestIds.add(data.providerCallId);
      const ended=events.filter(event=>event.type!=='provider_call_started'&&JSON.parse(event.dataJson).providerCallId===data.providerCallId);
      assert.equal(ended.length,1);
      const end=ended[0],result=providerCallData(JSON.parse(end.dataJson),end.type);
      for(const field of ['providerCallId','step','mode','classification','endpoint'])assert.equal(result[field],data[field]);
      for(const field of ['incidentId','provider','model','correlationId','runId'])assert.equal(end[field],start[field]);
      assert.ok(Date.parse(end.time)>=Date.parse(start.time));
      assert.ok(Number.isFinite(result.durationMs)&&result.durationMs>=0&&result.durationMs<=120000);
      assert.equal(result.outcome,end.type==='provider_call_completed'?'completed':'failed');
      assert.deepEqual(JSON.parse(end.dataJson),result); // no arbitrary prompt/body/header keys persisted
      assert.equal(result.monetaryCost,'UNKNOWN');
      assert.equal(result.costEstimateUsd,undefined); // no verified monetary pricing configured
      if(result.usageSource==='reported') {
        assert.ok(['promptTokens','completionTokens','totalTokens'].some(field=>result[field]!==undefined));
        reportedCalls++;
      }else {
        assert.equal(result.usageSource,'unavailable');
        for(const field of ['promptTokens','completionTokens','totalTokens'])assert.equal(result[field],undefined);
      }
      if(result.mode==='final_json')finalizationCalls++;
      if(end.type==='provider_call_failed')failedCalls++;
    }
    assert.equal(events.length,starts.length*2);
    assert.equal(new Set(starts.map(event=>JSON.parse(event.dataJson).step)).size,starts.length);
    console.log(JSON.stringify({actualScopedProviderTelemetry:true,runId:run.id,runStatus:run.status,provider:'NVIDIA',model:config.model,requestPairs:starts.length,finalizationCalls,failedCalls,reportedUsageCalls:reportedCalls,unavailableUsageCalls:starts.length-reportedCalls,monetaryCost:'UNAVAILABLE',scenarioVersion:snapshot.incident.scenarioVersion}));
  }finally{conn.disconnect();}
}
main().catch(()=>{console.error('FAIL: '+phase+'; no credentials, evidence, request headers or provider body output');process.exitCode=1;});
