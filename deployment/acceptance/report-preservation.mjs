// Local read-only comparison of authorized report exports. No credentials or evidence bodies printed.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

let phase='authorized report files';
try {
  const [baselinePath,currentPath]=process.argv.slice(2);
  assert.ok(baselinePath&&currentPath);
  const baseline=JSON.parse(await readFile(baselinePath,'utf8'));
  const bytes=await readFile(currentPath);
  const current=JSON.parse(bytes.toString('utf8'));
  assert.equal(current.incidentId,baseline.incidentId);
  const before=baseline.summary,after=current.summary;
  assert.ok(before&&after&&typeof after==='object');
  assert.equal(after.scenarioVersion,before.scenarioVersion);
  assert.equal(after.status,before.status);
  phase='previously accepted operational records';
  for(const key of ['actions','decisions','evidenceIndex','findings','graphReviews','investigations','scenarioHistory','verifications']) {
    assert.ok(Array.isArray(before[key])&&Array.isArray(after[key]));
    for(const old of before[key]) {
      const row=after[key].find(value=>value.id===old.id);
      assert.ok(row);
      // New safe report fields may be added; previously exported fields must be byte-meaning equivalent.
      assert.deepEqual(Object.fromEntries(Object.keys(old).map(field=>[field,row[field]])),old);
    }
  }
  for(const id of before.evidenceIds)assert.ok(after.evidenceIds.includes(id));
  assert.equal(after.verifications.length,before.verifications.length);
  assert.equal(after.decisions.length,before.decisions.length);
  assert.equal(after.scenarioHistory.length,before.scenarioHistory.length);
  phase='new report fidelity';
  const historicalGraphReview=before.graphReviews.find(row=>row.decision==='VERIFIED'&&row.findingId);
  assert.ok(historicalGraphReview);
  const reviewed=after.findings.find(row=>row.id===historicalGraphReview.findingId);
  assert.equal(reviewed?.verificationStatus,'VERIFIED');
  const review=after.findingReviews?.find(row=>row.findingId===reviewed.id);
  assert.equal(review?.findingId,reviewed.id);
  assert.equal(review.reviewedBy,historicalGraphReview.reviewedBy);
  assert.ok(typeof review.auditEventId==='string'&&review.auditEventId.length>0);
  assert.ok(Number.isFinite(Date.parse(review.reviewedAt))&&typeof review.reason==='string'&&review.reason.length>0);
  assert.match(review.auditHash,/^[a-f0-9]{64}$/i);
  assert.equal(after.retentionPolicy?.incidentId,current.incidentId);
  for(const row of after.actions) {
    assert.ok(Array.isArray(row.assumptions));
    assert.ok(Array.isArray(row.uncertainty));
  }
  phase='unexecuted negative control';
  const controls=before.actions.filter(row=>row.status==='PENDING_APPROVAL'&&!before.decisions.some(decision=>decision.proposalId===row.id)&&!before.verifications.some(verification=>verification.proposalId===row.id));
  assert.ok(controls.length>0);
  for(const control of controls) {
    assert.equal(after.actions.find(row=>row.id===control.id)?.status,'PENDING_APPROVAL');
    assert.ok(!after.decisions.some(row=>row.proposalId===control.id));
    assert.ok(!after.verifications.some(row=>row.proposalId===control.id));
  }
  console.log(JSON.stringify({actualAuthorizedReport:true,scenarioVersion:after.scenarioVersion,retainedHistoricalActions:before.actions.length,retainedVerifications:before.verifications.length,retainedGraphReviews:before.graphReviews.length,findingReviewStatus:'VERIFIED',manualPlanningProjection:'PRESENT',reservedControl:'PENDING_UNEXECUTED',sha256:createHash('sha256').update(bytes).digest('hex')}));
}catch {
  console.error('FAIL: '+phase+'; no report/evidence text or credentials printed');
  process.exitCode=1;
}
