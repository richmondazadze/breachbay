/** ENV-ONLY REAL DEPLOYED ACCEPTANCE. No dotenv, token minting, provider mocks or data deletion. */
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {connectBackend,snapshotFromConnection,executeCommand,type DbConnection} from "../../client";
import {verifyIdToken} from "../../clerk-token";
import {secureEndpoint,verifiedExecution,verifyOutage} from "./validate";
import {sha256,canonical} from "../../../../../spacetimedb/src/hash";
const required=(name:string)=>{const value=process.env[name];assert(value,`Missing ${name}`);return value;};
const meta=()=>({idempotencyKey:randomUUID(),correlationId:randomUUID()});
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function eventually(check:()=>boolean,message:string,limit=6000) {const end=Date.now()+limit;while(Date.now()<end){if(check())return;await delay(50);}assert.fail(message);}
async function confirmed(conn:DbConnection,m:ReturnType<typeof meta>,fn:()=>Promise<void>){const result=await executeCommand(conn,m,fn);assert(result.ok,"Reducer did not return a committed successful receipt");return result.data.id;}
async function denied(fn:()=>Promise<void>,code:string){let rejected=false;try{await fn();}catch(error){rejected=error instanceof Error && error.message.includes(code);}assert(rejected,`Expected ${code} rejection`);}
async function main(){
 const origin=secureEndpoint(required("BREACHBAY_CORE_ORIGIN")).origin,endpoint=secureEndpoint(required("BREACHBAY_CORE_ENDPOINT")).href;
 assert.equal(process.env.APP_ORIGIN,origin,"APP_ORIGIN must match deployment");secureEndpoint(required("CLERK_ISSUER_URL"));
 const database=required("BREACHBAY_CORE_DATABASE"),mode=process.env.BREACHBAY_CORE_MODE ?? "core";assert(["core","revocation","outage"].includes(mode));
 const tokens=[required("BREACHBAY_CORE_COMMANDER_JWT"),required("BREACHBAY_CORE_RESPONDER_JWT"),required("BREACHBAY_CORE_SERVICE_JWT")];
 const claims=await Promise.all(tokens.map(token=>verifyIdToken(token)));
 assert.equal(new Set(claims.map(c=>c.sub)).size,3,"Three distinct principals required");
 for(const claim of claims.slice(0,2)){assert.equal(claim.azp,origin,"Human requires original browser-origin JWT");assert(Number(claim.exp)*1000-Date.now()>45000,"Fresh original responder JWT requires >45 seconds remaining");}
 assert.equal(claims[2].sub,required("AI_SERVICE_CLERK_USER_ID"),"Explicit dedicated service subject mismatch");
 const http=(index:number,path:string,method="GET",body?:BodyInit,contentType?:string)=>fetch(origin+path,{method,headers:{Authorization:`Bearer ${tokens[index]}`,...(method!=="GET"?{Origin:origin}:{}),...(contentType?{"Content-Type":contentType}:{})},body,redirect:"error",signal:AbortSignal.timeout(mode==="outage"?90000:10000)});
 // Route authentication checks real active Clerk sessions before any fixture mutation.
 const sessions=await Promise.all(tokens.map(async(_,index)=>{const response=await http(index,"/api/auth/session");const value=await response.json();assert(response.ok && value.ok && value.data.user.status==="ACTIVE","Actual application session validation failed");return value.data;}));
 const connections:DbConnection[]=[];const granted:number[]=[];let principalIds:(string|undefined)[]=[];let proof:Record<string,unknown>|undefined;let incidentId:string|undefined;let cleanup="NOT_NEEDED";
 try{
  for(const token of tokens)connections.push(await connectBackend({endpoint,database,token}));
  const [a,b,service]=connections;const ids=connections.map(c=>[...c.db.myProfile.iter()][0]?.id);assert(ids.every(Boolean));principalIds=ids;
  assert.equal(ids[0],sessions[0].user.id);assert.equal(ids[1],sessions[1].user.id);assert.equal(ids[2],sessions[2].user.id);
  assert.equal([...a.db.myProfile.iter()][0].platformAdmin,true,"Commander must be explicitly configured; no automatic grant");
  const label=`SYNTHETIC deployed acceptance ${randomUUID()}`;
  const create=async(title:string)=>{const m=meta();return confirmed(a,m,()=>a.reducers.createIncident({...m,title,description:"Explicit synthetic backend acceptance fixture; preserved audit/evidence",severity:"CRITICAL",classification:"SYNTHETIC",scenarioId:"credential-compromise"}));};
  incidentId=await create(label);const foreignId=await create(label+" foreign");
  await eventually(()=>Boolean(snapshotFromConnection(a,incidentId!)),"Commander incident subscription missing");
  const state=()=>{const snapshot=snapshotFromConnection(a,incidentId!);assert(snapshot && snapshot.incident.classification==="SYNTHETIC");return snapshot;};
  assert.equal(snapshotFromConnection(b,foreignId),undefined,"Foreign incident visible");
  await denied(()=>b.reducers.postMessage({...meta(),incidentId:foreignId,text:"Synthetic foreign write denial"}),"FORBIDDEN");
  const foreignEvidence= snapshotFromConnection(a,foreignId)!.evidence[0];assert(foreignEvidence);
  const foreignRead=await http(1,`/api/evidence/${encodeURIComponent(foreignEvidence.id)}/original`);assert.equal(foreignRead.status,403,"Foreign original access not denied");
  for(const [index,role] of [[1,"INVESTIGATOR"],[2,"AI_SERVICE"]] as const){
   const m=meta();const invitation=await confirmed(a,m,()=>a.reducers.inviteMember({...m,incidentId:incidentId!,targetSubject:String(claims[index].sub),role}));
   const accepted=meta();await confirmed(connections[index],accepted,()=>connections[index].reducers.acceptInvitation({...accepted,invitationId:invitation}));granted.push(index);cleanup="PENDING";
  }
  cleanup="PENDING";
  await eventually(()=>Boolean(snapshotFromConnection(b,incidentId!)) && Boolean(snapshotFromConnection(service,incidentId!)),"Granted scoped subscriptions missing");
  const chat=meta();const chatId=await confirmed(b,chat,()=>b.reducers.postMessage({...chat,incidentId:incidentId!,text:"Synthetic live collaboration acceptance"}));
  await eventually(()=>state().messages.some(m=>m.id===chatId),"Second user chat did not arrive live");
  assert.equal(await confirmed(b,chat,()=>b.reducers.postMessage({...chat,incidentId:incidentId!,text:"Synthetic live collaboration acceptance"})),chatId);
  await denied(()=>b.reducers.postMessage({...chat,incidentId:incidentId!,text:"Synthetic changed retry payload"}),"IDEMPOTENCY_CONFLICT");
  assert.equal(state().messages.filter(m=>m.id===chatId).length,1);
  const task=meta();const taskId=await confirmed(a,task,()=>a.reducers.assignTask({...task,incidentId:incidentId!,title:"Synthetic assigned response task",assigneeId:ids[1],state:"TODO"}));
  await eventually(()=>snapshotFromConnection(b,incidentId!)!.tasks.some(t=>t.id===taskId),"Assigned task not received live");
  const update=meta();await confirmed(b,update,()=>b.reducers.assignTask({...update,incidentId:incidentId!,taskId,title:"Synthetic assigned response task",assigneeId:ids[1],state:"IN_PROGRESS",expectedVersion:1}));
  await eventually(()=>state().tasks.some(t=>t.id===taskId && t.state==="IN_PROGRESS" && t.version===2),"Task update not received");
  await denied(()=>b.reducers.assignTask({...meta(),incidentId:incidentId!,taskId,title:"Synthetic stale task",assigneeId:ids[1],state:"DONE",expectedVersion:1}),"VERSION_CONFLICT");
  const upload=meta(),content=JSON.stringify({eventType:"SYNTHETIC_ACCEPTANCE_LOG",description:"Synthetic application-host containment fixture",assetId:`${incidentId}:app-host`,outcome:"ALLOWED"});
  const form=new FormData();for(const [key,value] of Object.entries({...upload,incidentId,classification:"SYNTHETIC",modelApproved:"true",title:"Synthetic original integrity fixture",capturedAt:new Date().toISOString()}))form.set(key,value!);
  form.set("file",new Blob([content],{type:"application/json"}),"synthetic.json");
  const uploaded=await http(0,"/api/evidence/upload","POST",form),uploadResult=await uploaded.json();assert(uploaded.ok && uploadResult.ok,"Original upload failed");const evidenceId=uploadResult.data.id as string;
  await eventually(()=>state().evidence.some(e=>e.id===evidenceId),"Uploaded evidence not committed");
  assert.equal(state().evidence.find(e=>e.id===evidenceId)!.sha256,createHash("sha256").update(content).digest("hex"));
  const raw=await http(1,`/api/evidence/${encodeURIComponent(evidenceId)}/original`);assert(raw.ok,"Scoped original read failed");assert.equal(await raw.text(),content);
  const aiRaw=await http(2,`/api/evidence/${encodeURIComponent(evidenceId)}/original`);assert.equal(aiRaw.status,403,"AI must not read originals");
  const replay=await http(0,"/api/evidence/upload","POST",form);const replayResult=await replay.json();assert(replay.ok && replayResult.data?.id===evidenceId,"Upload retry did not recover receipt");
  if(mode==="outage"){
   assert.equal(process.env.BREACHBAY_CORE_OUTAGE_CONFIRMED,"1","Operator must enable actual provider outage externally");const prior=new Set(state().investigations.map(r=>r.id));
   const response=await http(0,"/api/investigations","POST",JSON.stringify({incidentId,objective:"Synthetic provider outage acceptance; no fabricated investigation",idempotencyKey:randomUUID()}),"application/json");const failure=await response.json();
   assert(!response.ok && failure.ok===false && ["MODEL_UNAVAILABLE","RATE_LIMITED"].includes(failure.error?.code),"Expected actual model-unavailable response");
   await eventually(()=>state().investigations.filter(r=>!prior.has(r.id)).every(r=>["FAILED","CANCELLED"].includes(r.status)),"Outage run not terminal");verifyOutage(state(),prior);
  }
  for(const status of ["TRIAGED","INVESTIGATING"] as const){const m=meta();await confirmed(a,m,()=>a.reducers.transitionIncident({...m,incidentId:incidentId!,status,reason:"Synthetic manual continuity",expectedVersion:state().incident.version}));}
  const propose=async(target:string)=>{const m=meta();return confirmed(b,m,()=>b.reducers.proposeAction({...m,incidentId:incidentId!,action:{type:"ISOLATE_SIMULATED_HOST",targetIds:[`${incidentId}:${target}`]},rationale:"Synthetic evidence-backed manual containment",evidenceIds:[evidenceId],assumptions:["Synthetic only"],uncertainty:["Alternate path and service costs remain"],expectedVersion:1}));};
  const proposalId=await propose("app-host"),staleId=await propose("workstation");
  for(const id of [proposalId,staleId]){const m=meta();await confirmed(a,m,()=>a.reducers.simulateAction({...m,incidentId:incidentId!,proposalId:id,expectedVersion:1}));}
  await eventually(()=>state().proposals.filter(p=>[proposalId,staleId].includes(p.id)).every(p=>p.status==="PENDING_APPROVAL"),"Simulation not committed");
  const version=state().proposals.find(p=>p.id===proposalId)!.version,staleVersion=state().proposals.find(p=>p.id===staleId)!.version;
  const observer=meta();await confirmed(a,observer,()=>a.reducers.setMember({...observer,incidentId:incidentId!,userId:ids[1]!,role:"OBSERVER",active:true}));
  for(const deniedActor of [b,service])await denied(()=>deniedActor.reducers.approveAction({...meta(),incidentId:incidentId!,proposalId,decision:"APPROVE",justification:"Synthetic forbidden actor test",expectedVersion:1,proposalVersion:version}),"FORBIDDEN");
  const restore=meta();await confirmed(a,restore,()=>a.reducers.setMember({...restore,incidentId:incidentId!,userId:ids[1]!,role:"INVESTIGATOR",active:true}));
  const approval=meta();await confirmed(a,approval,()=>a.reducers.approveAction({...approval,incidentId:incidentId!,proposalId,decision:"APPROVE",justification:"Synthetic authenticated reducer approval; actual human UI gate remains unverified",expectedVersion:1,proposalVersion:version}));
  const execution=meta();for(let repeat=0;repeat<2;repeat++)await confirmed(a,execution,()=>a.reducers.executeSimulation({...execution,incidentId:incidentId!,proposalId,expectedVersion:1}));
  await eventually(()=>state().verifications.some(v=>v.proposalId===proposalId),"Execution verification missing");const verified=verifiedExecution(state(),proposalId,2);
  assert.equal(state().assets.find(x=>x.id===`${incidentId}:app-host`)!.state,"ISOLATED");assert.equal(state().assets.find(x=>x.id===`${incidentId}:customer-portal`)!.state,"DEGRADED");
  await denied(()=>a.reducers.executeSimulation({...meta(),incidentId:incidentId!,proposalId,expectedVersion:1}),"INVALID_TRANSITION");
  await denied(()=>a.reducers.approveAction({...meta(),incidentId:incidentId!,proposalId:staleId,decision:"APPROVE",justification:"Synthetic scenario drift rejection",expectedVersion:1,proposalVersion:staleVersion}),"VERSION_CONFLICT");
  const report=meta();const exported=await http(0,`/api/incidents/${encodeURIComponent(incidentId)}/report`,"POST",JSON.stringify(report),"application/json");assert(exported.ok && exported.headers.get("content-disposition")?.startsWith("attachment"),"Audited report download failed");const reportResult=await exported.json();assert.equal(reportResult.incidentId,incidentId);
  await eventually(()=>state().reports.some(r=>r.id===reportResult.id) && state().auditEvents.some(e=>e.objectId===reportResult.id),"Report audit missing");
  for(const event of state().auditEvents){const {hash,...body}=event;assert.equal(hash,sha256(canonical(body)));assert(!event.previousHash || state().auditEvents.some(e=>e.hash===event.previousHash),"Audit link missing");}
  const revoke=meta();await confirmed(a,revoke,()=>a.reducers.setMember({...revoke,incidentId:incidentId!,userId:ids[1]!,role:"INVESTIGATOR",active:false}));await eventually(()=>!snapshotFromConnection(b,incidentId!),"Revocation did not retract snapshot");
  if(mode==="revocation"){
   const restore=meta();await confirmed(a,restore,()=>a.reducers.setMember({...restore,incidentId:incidentId!,userId:ids[1]!,role:"INVESTIGATOR",active:true}));
   const logout=await http(1,"/api/auth/logout","POST");assert(logout.ok,"Named responder-session logout failed");await eventually(()=>!snapshotFromConnection(b,incidentId!),"Logout did not retract old lease rows");
   await denied(()=>b.reducers.postMessage({...meta(),incidentId:incidentId!,text:"Synthetic revoked session denial"}),"UNAUTHENTICATED");
   let rejected=false;try{const old=await connectBackend({endpoint,database,token:tokens[1]});old.disconnect();}catch{rejected=true;}assert(rejected,"Old original JWT reconnect accepted");
  }
  proof={outcome:"PASS",mode,incidentId,foreignId,chatId,taskId,evidenceId,reportId:reportResult.id,...verified,modelCalls:mode==="outage"?"ACTUAL_UNAVAILABLE_ATTEMPT":"NOT_REQUESTED",oldSessionLogout:mode==="revocation"?"PASS":"NOT_RUN"};
 }finally{
  if(incidentId && connections[0]?.isActive){const a=connections[0];cleanup="PASS";for(const index of granted){const id=principalIds[index];if(!id){cleanup="PENDING";continue;}const m=meta();const result=await executeCommand(a,m,()=>a.reducers.setMember({...m,incidentId:incidentId!,userId:id,role:index===2?"AI_SERVICE":"INVESTIGATOR",active:false}));if(!result.ok)cleanup="PENDING";}}
  for(const connection of connections)connection.disconnect();console.log(JSON.stringify({membershipCleanup:cleanup,preserved:"INCIDENTS_EVIDENCE_AUDIT_REPORTS",humanUiApproval:"UNVERIFIED"}));
 }
 assert(proof && cleanup!=="PENDING","Acceptance or named membership cleanup incomplete");console.log(JSON.stringify(proof));
}
main().catch(()=>{console.error("FAIL/BLOCKED: deployed core acceptance did not complete; inspect server diagnostics privately. No credentials emitted.");process.exitCode=1;});
