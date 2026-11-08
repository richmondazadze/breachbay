import assert from 'node:assert/strict';
import {createClerkClient} from '@clerk/backend';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
let phase="configuration";
async function main(){
 const {CLERK_SECRET_KEY,AI_SERVICE_CLERK_USER_ID,AI_SERVICE_CLERK_SESSION_ID,APP_ORIGIN}=process.env;
 assert.ok(CLERK_SECRET_KEY && AI_SERVICE_CLERK_USER_ID && AI_SERVICE_CLERK_SESSION_ID && APP_ORIGIN);
 const client=createClerkClient({secretKey:CLERK_SECRET_KEY});
 phase="Clerk session renewal";
 const token=await client.sessions.getToken(AI_SERVICE_CLERK_SESSION_ID,undefined,120);
 const headers={Authorization:`Bearer ${token.jwt}`};
 phase="HTTPS original validator";
 const check=await fetch(APP_ORIGIN+'/api/auth/validate',{method:'POST',headers,signal:AbortSignal.timeout(20000)});
 if(check.status!==200) throw new Error('HTTP_'+check.status);
 const validation=await check.json();
 assert.equal(validation.subject,AI_SERVICE_CLERK_USER_ID);
 assert.equal(validation.sessionId,AI_SERVICE_CLERK_SESSION_ID);
 phase="Spacetime read lease";
 const session=await fetch(APP_ORIGIN+'/api/auth/session',{headers,signal:AbortSignal.timeout(25000)});
 if(session.status!==200){const err=await session.json().catch(()=>({})); const code=err.error?.code??err.code??'UNKNOWN'; throw new Error('HTTP_'+session.status+'_'+code);}
 phase="service profile binding";
 const result=await session.json();
 assert.equal(result.ok,true);
 assert.match(result.data.user.id,/^[0-9a-f]{64}$/);
 assert.equal(result.data.user.displayName,'Investigation service');
 assert.equal(result.data.user.status,'ACTIVE');
 assert.equal(result.data.user.platformAdmin,false);
 phase="original evidence denial";
 const denied=await fetch(APP_ORIGIN+'/api/evidence/unrelated/original',{headers,signal:AbortSignal.timeout(10000)});
 assert.ok([403,404].includes(denied.status));
 if(process.env.BREACHBAY_SERVICE_INCIDENT_ID){
  phase="actual granted incident derivative/original boundary";
  const imported=await import(pathToFileURL(join(process.cwd(),'src/lib/backend/client.ts')).href);
  const backend=imported.default??imported;
  const conn=await backend.connectBackend({endpoint:process.env.SPACETIMEDB_ENDPOINT??process.env.NEXT_PUBLIC_SPACETIMEDB_ENDPOINT,database:process.env.SPACETIMEDB_DATABASE??process.env.NEXT_PUBLIC_SPACETIMEDB_DATABASE,token:token.jwt});
  try{
   const state=backend.snapshotFromConnection(conn,process.env.BREACHBAY_SERVICE_INCIDENT_ID);
   assert.equal(state?.incident.classification,'SYNTHETIC');
   assert.ok(state.memberships.some(m=>m.userId===result.data.user.id&&m.active&&m.role==='AI_SERVICE'));
   assert.ok(!state.evidence.some(e=>e.title==='Synthetic workstation credential observation'));
   const sample=state.evidence.find(e=>e.title==='Synthetic model-approved workstation observation');
   assert.equal(sample?.modelApproved,true);
   const scopedDenied=await fetch(APP_ORIGIN+'/api/evidence/'+encodeURIComponent(sample.id)+'/original',{headers,signal:AbortSignal.timeout(10000)});
   assert.equal(scopedDenied.status,403);
   console.log('PASS: actual incident-granted service sees approved derivative, excludes unapproved evidence and is denied its scoped original');
  }finally{conn.disconnect();}
 }
 console.log('PASS: real production Clerk JWT -> HTTPS validator -> original lease -> active non-admin service profile; human-only original access denied');
}
main().catch(error=>{const code=error instanceof Error && /^HTTP_[A-Z0-9_]+$/.test(error.message)?error.message:'CHECK_FAILED';console.error('FAIL: '+phase+' '+code+'; no credential output');process.exitCode=1;});
