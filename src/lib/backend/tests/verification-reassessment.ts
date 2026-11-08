import assert from "node:assert/strict";
import { verificationReassessment } from "../../../../spacetimedb/src/verification-reassessment";
assert.equal(verificationReassessment("VERIFIED_SUCCESS","verification-5","proposal-4"),undefined);
for(const status of ["VERIFIED_PARTIAL","VERIFIED_FAILED"] as const){
 const task=verificationReassessment(status,"verification-5","proposal-4")!;
 assert.equal(task.state,"TODO");assert(task.title.length<80);
 assert.equal(task.detail.verificationId,"verification-5");assert.equal(task.detail.proposalId,"proposal-4");assert.equal(task.detail.status,status);
 assert.equal(task.detail.humanReviewRequired,true);assert(task.detail.guidance.includes("Inspect mismatch, refresh evidence, rerun investigation"));
 assert(!("action" in task));assert(!("provider" in task));
}
console.log("PASS pure partial/failed verification branches require referenced human reassessment; success queues none (no live divergence/fault injection claimed)");
