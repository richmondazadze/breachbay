import assert from "node:assert/strict";
import type {IncidentSnapshot} from "../../../contracts";
export function secureEndpoint(value:string) {
 const url=new URL(value);assert.equal(url.protocol,"https:");assert(!url.username && !url.password && !url.search && !url.hash,"HTTPS endpoint must not carry credentials/query");return url;
}
export function verifiedExecution(snapshot:IncidentSnapshot,proposalId:string,expectedVersion:number) {
 const results=snapshot.verifications.filter(v=>v.proposalId===proposalId);
 assert.equal(results.length,1,"Expected exactly one committed verification");assert.equal(results[0].status,"VERIFIED_SUCCESS");assert.equal(snapshot.incident.scenarioVersion,expectedVersion);
 assert(snapshot.approvals.some(a=>a.proposalId===proposalId && a.decision==="APPROVE"),"Missing committed approval");
 return {proposalId,verificationId:results[0].id,scenarioVersion:expectedVersion,approvalGate:"AUTHENTICATED_REDUCER_ONLY",humanUiApproval:"UNVERIFIED"};
}
export function verifyOutage(snapshot:IncidentSnapshot,prior:Set<string>) {
 const runs=snapshot.investigations.filter(r=>!prior.has(r.id));assert(runs.length>0,"No canonical outage run observed");
 assert(runs.every(r=>["FAILED","CANCELLED"].includes(r.status)),"Outage left active or successful runs");
 const ids=new Set(runs.map(r=>r.id));assert(!snapshot.findings.some(f=>ids.has(f.investigationId)),"Outage fabricated findings");assert(!snapshot.proposals.some(p=>p.investigationId && ids.has(p.investigationId)),"Outage fabricated proposal");
}
