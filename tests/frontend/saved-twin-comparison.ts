import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { IncidentSnapshot, Proposal, ScenarioSnapshot } from "../../src/lib/contracts";
import { credentialCompromiseScenario } from "../../src/lib/simulation/scenario";
import { simulateResponse } from "../../src/lib/simulation/engine";
import { savedTwinComparison } from "../../src/components/response-model/saved-comparison";
const id="saved-twin-test",before=credentialCompromiseScenario(id);
const proposal={id:"proposal",incidentId:id,expectedVersion:1,action:{type:"ISOLATE_SIMULATED_HOST",targetIds:["app-host"]}} as Proposal;
const after=simulateResponse(before,proposal.action,1).nextState;
const beforeJson=JSON.stringify(before),afterJson=JSON.stringify(after);
const digest=(json:string)=>createHash("sha256").update(json).digest("hex");
const parent={id:"parent",incidentId:id,scenarioVersion:1,operation:"INITIAL",stateDigest:digest(beforeJson)} as ScenarioSnapshot;
const target={id:"target",incidentId:id,scenarioVersion:2,parentVersion:1,operation:"EXECUTION",proposalId:proposal.id,stateDigest:digest(afterJson)} as ScenarioSnapshot;
const snapshot={incident:{id,scenarioVersion:99},proposals:[proposal],scenarioHistory:[parent,target]} as IncidentSnapshot;
test("saved visual pair preserves exact historical versions even when current scenario has advanced",async()=>{
 const pair=await savedTwinComparison(snapshot,parent,target,beforeJson,afterJson);
 assert.equal(pair.before.version,1);assert.equal(pair.after.version,2);assert.equal(snapshot.incident.scenarioVersion,99);
 assert.equal(pair.before.nodes.find(n=>n.id==="app-host")?.state,"ACTIVE");assert.equal(pair.after.nodes.find(n=>n.id==="app-host")?.state,"ISOLATED");
 assert.equal(pair.after.links.find(e=>e.id==="jump-db")?.enabled,true);assert.equal(pair.matchesRecordedAction,true);
});
test("foreign, missing, altered and unsupported saved records cannot drive a comparison",async()=>{
 await assert.rejects(savedTwinComparison({...snapshot,incident:{...snapshot.incident,id:"foreign"}},parent,target,beforeJson,afterJson));
 await assert.rejects(savedTwinComparison({...snapshot,scenarioHistory:[target]},parent,target,beforeJson,afterJson));
 await assert.rejects(savedTwinComparison(snapshot,parent,target,beforeJson,afterJson.replace("ISOLATED","ACTIVE")),/integrity/);
 await assert.rejects(savedTwinComparison(snapshot,parent,{...target,operation:"RESTORE"},beforeJson,afterJson));
});
test("a digest-valid target mismatch is shown honestly and never replaced with recomputed state",async()=>{
 const altered=structuredClone(after);altered.edges.find(e=>e.id==="ws-app")!.enabled=true;
 const json=JSON.stringify(altered),record={...target,stateDigest:digest(json)};
 const pair=await savedTwinComparison({...snapshot,scenarioHistory:[parent,record]},parent,record,beforeJson,json);
 assert.equal(pair.matchesRecordedAction,false);assert.equal(pair.after.links.find(e=>e.id==="ws-app")?.enabled,true);assert.ok(pair.mismatches.length);
});
