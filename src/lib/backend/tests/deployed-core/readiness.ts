import {test} from "node:test";
import assert from "node:assert/strict";
import type {IncidentSnapshot,Membership} from "../../../contracts";
import {secureEndpoint,verifiedExecution,verifyOutage} from "./validate";
import {originalReadAllowed} from "../../evidence-access";
test("deployed runner endpoints reject token URLs/plain HTTP",()=>{
 assert.equal(secureEndpoint("https://breachbay.us").origin,"https://breachbay.us");
 for(const value of ["http://breachbay.us","https://x:y@breachbay.us","https://breachbay.us/?token=x","https://breachbay.us/#secret"])assert.throws(()=>secureEndpoint(value));
});
test("cannot report execution without one real verification/current version/committed approval",()=>{
 const s={incident:{scenarioVersion:2},verifications:[{id:"v",proposalId:"p",status:"VERIFIED_SUCCESS"}],approvals:[{proposalId:"p",decision:"APPROVE"}]} as unknown as IncidentSnapshot;
 assert.equal(verifiedExecution(s,"p",2).humanUiApproval,"UNVERIFIED");assert.throws(()=>verifiedExecution(s,"p",1));
 s.verifications.push(s.verifications[0]);assert.throws(()=>verifiedExecution(s,"p",2));s.verifications=[];assert.throws(()=>verifiedExecution(s,"p",2));
});
test("outage cannot claim continuity with invented completion/findings or abandoned job",()=>{
 const s={investigations:[{id:"r",status:"FAILED"}],findings:[],proposals:[]} as unknown as IncidentSnapshot;verifyOutage(s,new Set());
 s.investigations[0].status="RUNNING";assert.throws(()=>verifyOutage(s,new Set()));s.investigations[0].status="COMPLETED";assert.throws(()=>verifyOutage(s,new Set()));
});
test("AI/service originals remain denied despite READ; human scope/revocation enforced",()=>{
 const human={userId:"u",active:true,role:"OBSERVER",capabilities:["READ"]} as Membership;
 assert(originalReadAllowed([human],"u"));assert(!originalReadAllowed([{...human,active:false}],"u"));assert(!originalReadAllowed([human],"other"));assert(!originalReadAllowed([{...human,role:"AI_SERVICE"}],"u"));assert(!originalReadAllowed([{...human,capabilities:[]}],"u"));
});
