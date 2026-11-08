import { test } from "node:test";
import assert from "node:assert/strict";
import { traceEvidenceIds, safeTraceJson, toolTrace, terminalRun, runDeadlineReached } from "../investigation-trace";
test("search and correlation retain canonical evidence IDs, bounded redacted trace drops credentials",()=>{
 assert.deepEqual(traceEvidenceIds([{id:"e1"},{evidenceId:"e2"},{evidenceId:"e2"},null]),["e1","e2"]);
 const trace=JSON.parse(safeTraceJson({result:{description:"token=synthetic-secret contact@example.invalid",storageRef:"private",password:"fictional"}}));
 assert(!JSON.stringify(trace).includes("synthetic-secret")); assert(!JSON.stringify(trace).includes("contact@")); assert(!("storageRef" in trace.result)); assert(!("password" in trace.result));
 assert.throws(()=>safeTraceJson(["x".repeat(30000),"y".repeat(30000)]));
});
test("tool trace validates actual argument digest, call identity and finite provider latency",()=>{
 const data={toolCallId:"call-1",argumentsDigest:"a".repeat(64),providerLatencyMs:40,result:[{evidenceId:"e1",version:2}]};
 const trace=toolTrace(data); assert.equal(trace.toolCallId,"call-1");assert.equal(trace.providerLatencyMs,40);assert(trace.resultJson?.includes("e1"));
 for(const bad of [{...data,argumentsDigest:"missing"},{...data,toolCallId:""},{...data,providerLatencyMs:NaN}])assert.throws(()=>toolTrace(bad));
});
test("fixed deadline boundary and terminal states prevent renewal of abandoned jobs",()=>{
 const created="2026-11-07T00:00:00.000Z",base=Date.parse(created);
 assert.equal(runDeadlineReached(created,base+119999),false);assert.equal(runDeadlineReached(created,base+120000),true);
 assert.equal(terminalRun("COMPLETED"),true);assert.equal(terminalRun("RUNNING"),false);
});

test("completed retry recovers only canonical same-incident run artifacts without invoking provider",async()=>{
 const {completedRunResult}=await import("../investigation-recovery");
 const snapshot={incident:{id:"i"},investigations:[{id:"r",incidentId:"i",status:"COMPLETED"}],findings:[{incidentId:"i",investigationId:"r",summary:"supported",confidence:"HIGH",evidenceIds:["e"],unknowns:[]},{incidentId:"foreign",investigationId:"r",summary:"foreign"}],proposals:[{incidentId:"i",investigationId:"r",id:"p"}]} as unknown as import("../../contracts").IncidentSnapshot;
 assert.deepEqual(completedRunResult(snapshot,"r"),{runId:"r",findings:[{summary:"supported",confidence:"HIGH",evidenceIds:["e"],unknowns:[]}],proposalId:"p"});
 assert.equal(completedRunResult(snapshot,"other"),undefined);
 snapshot.investigations[0].status="RUNNING";assert.equal(completedRunResult(snapshot,"r"),undefined);
});
