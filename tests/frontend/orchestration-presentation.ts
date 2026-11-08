import test from "node:test";
import assert from "node:assert/strict";
import type { Investigation, InvestigationStreamEvent } from "../../src/lib/contracts";
import { orchestrationPresentation } from "../../src/hooks/orchestration-presentation";
const run: Investigation={id:"run-1",incidentId:"incident-1",objective:"Synthetic investigation",requestedBy:"human",status:"RUNNING",createdAt:"2026-11-08T00:00:00Z",updatedAt:"2026-11-08T00:00:03Z"};
const event=(id:string,type:InvestigationStreamEvent["type"],data:object,extra:Partial<InvestigationStreamEvent>={}):InvestigationStreamEvent=>({eventId:id,runId:run.id,incidentId:run.incidentId,type,time:`2026-11-08T00:00:0${id.slice(-1)}Z`,correlationId:"synthetic",dataJson:JSON.stringify(data),...extra});
const provider={providerCallId:"11111111-1111-4111-8111-111111111111",step:0,mode:"tools",endpoint:"https://integrate.api.nvidia.com/v1/chat/completions",classification:"SYNTHETIC",usageSource:"unavailable",monetaryCost:"UNKNOWN"};
test("orchestration pairs calls, deduplicates durable events and preserves a failed final gate",()=>{
 const start=event("e1","provider_call_started",{...provider,outcome:"started"});
 const end=event("e2","provider_call_completed",{...provider,outcome:"completed",durationMs:120});
 const view=orchestrationPresentation({...run,status:"FAILED"},[start,end,end,event("e3","run_failed",{code:"INVALID_MODEL_OUTPUT"})]);
 assert.equal(view.modelCalls.length,1);assert.equal(view.modelCompleted,1);assert.equal(view.gate,"Investigation failed");assert.equal(view.failureCode,"INVALID_MODEL_OUTPUT");
});
test("foreign incident or run records cannot drive progress",()=>{
 const view=orchestrationPresentation(run,[event("e1","tool_completed",{toolCallId:"call-a"},{tool:"search_evidence",incidentId:"other"}),event("e2","tool_completed",{toolCallId:"call-b"},{tool:"get_asset_graph",runId:"other"})]);
 assert.deepEqual(view.rows,[]);assert.equal(view.toolsCompleted,0);
});
test("a started call without a terminal observation is unconfirmed after cancellation",()=>{
 const start=event("e1","provider_call_started",{...provider,outcome:"started"});
 assert.equal(orchestrationPresentation(run,[start]).current?.state,"running");
 const cancelled=orchestrationPresentation({...run,status:"CANCELLED"},[start]);
 assert.equal(cancelled.rows[0].state,"unconfirmed");assert.equal(cancelled.current,undefined);assert.equal(cancelled.modelCompleted,0);
});
test("tool presentation pairs completion and exports only allowlisted citation metadata",()=>{
 const secret="UNSAFE_RAW_ARGUMENT_VALUE";
 const started=event("e1","tool_started",{toolCallId:"call-a",arguments:{secret},prompt:secret},{tool:"search_evidence"});
 const complete=event("e2","tool_completed",{toolCallId:"call-a",arguments:{secret},prompt:secret,result:[{id:"evidence-1",version:2,sha256:"a".repeat(64),excerpt:"redacted evidence"}]},{tool:"search_evidence"});
 const view=orchestrationPresentation(run,[started,complete]);
 assert.equal(view.tools.length,1);assert.equal(view.toolsCompleted,1);assert.equal(view.current,undefined);assert.deepEqual(view.tools[0].evidenceIds,["evidence-1"]);assert.doesNotMatch(JSON.stringify(view),/UNSAFE_RAW|arguments|prompt|redacted evidence/);
});
test("malformed provider metadata is not rendered as completed model work",()=>{
 const view=orchestrationPresentation(run,[event("e1","provider_call_completed",{...provider,outcome:"completed",durationMs:5,endpoint:"https://example.com/?key=secret"})]);
 assert.equal(view.modelCalls.length,0);assert.equal(view.modelCompleted,0);assert.equal(view.gate,"Awaiting the server's final result");
});
test("equal-time start events cannot overwrite completed provider or tool observations",()=>{
 const time="2026-11-08T00:00:01Z";
 const view=orchestrationPresentation(run,[event("a1","provider_call_completed",{...provider,outcome:"completed",durationMs:120},{time}),event("z1","provider_call_started",{...provider,outcome:"started"},{time}),event("a2","tool_completed",{toolCallId:"call-a",result:[{id:"evidence-1",version:2,sha256:"a".repeat(64),excerpt:"Synthetic evidence"}]},{tool:"search_evidence",time}),event("z2","tool_started",{toolCallId:"call-a"},{tool:"search_evidence",time})]);
 assert.equal(view.modelCompleted,1);assert.equal(view.toolsCompleted,1);assert.equal(view.current,undefined);assert.deepEqual(view.citedEvidenceIds,["evidence-1"]);
});
test("five stages never invent previews, validation or human decisions",()=>{
 const view=orchestrationPresentation(run,[event("e1","provider_call_completed",{...provider,outcome:"completed",durationMs:120}),event("e2","tool_completed",{toolCallId:"call-a"},{tool:"search_evidence"})]);
 assert.deepEqual(view.stages.map(s=>s.id),["evidence","model","preview","gate","review"]);
 assert.equal(view.stages[1].state,"observed");assert.equal(view.stages[2].state,"idle");assert.equal(view.stages[3].state,"idle");assert.equal(view.stages[4].state,"idle");
 const finished=orchestrationPresentation({...run,status:"COMPLETED"},[]);
 assert.equal(finished.stages[2].state,"idle");assert.equal(finished.stages[3].state,"observed");assert.equal(finished.stages[4].state,"ready");assert.equal(finished.stages[4].detail,"Evidence review required");
});
test("final composition activates validation while failed output never opens human review",()=>{
 const start=event("e1","provider_call_started",{...provider,mode:"final_json",outcome:"started"});
 assert.equal(orchestrationPresentation(run,[start]).stages[3].state,"active");
 const failed=orchestrationPresentation({...run,status:"FAILED"},[start]);
 assert.equal(failed.stages[3].state,"blocked");assert.equal(failed.stages[4].state,"idle");assert.equal(failed.current,undefined);
});
test("output counts and evidence citations are deduplicated and scoped",()=>{
 const finding=event("e1","finding",{});
 const proposal=event("e2","proposal",{});
 const view=orchestrationPresentation(run,[finding,finding,proposal,event("e3","proposal",{},{incidentId:"other"}),event("e4","tool_started",{toolCallId:"call-a",result:[{id:"unconfirmed",version:1,sha256:"a".repeat(64)}]},{tool:"simulate_response"})]);
 assert.equal(view.findingsRecorded,1);assert.equal(view.proposalsRecorded,1);assert.deepEqual(view.citedEvidenceIds,[]);assert.equal(view.stages[2].state,"active");
});
