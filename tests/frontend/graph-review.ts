import test from "node:test";
import assert from "node:assert/strict";
import type { GraphEdge, IncidentSnapshot } from "../../src/lib/contracts";
import { canVerifyGraphRelationship, parseGraphReviewPreparation, reviewableRelationshipTypes, reviewPreparationMatches, supportingReviewedFindings } from "../../src/hooks/graph-review";

const hash = "a".repeat(64);
const packet = { incidentId: "synthetic", edgeId: "descriptive", expectedEdgeDigest: hash, evidenceRefs: [{ evidenceId: "evidence", version: 2, sha256: hash, redactedSha256: hash }] };
const edge = { id: "descriptive", incidentId: "synthetic", fromId: "evidence", toId: "host", type: "OBSERVED_ON", sourceEvidenceIds: ["evidence"], assertedBy: "investigator", verificationStatus: "HYPOTHESIS" } as GraphEdge;
// Static synthetic projections only; no fake session/client or reducer execution.
const snapshot = { incident: { id: "synthetic" }, evidence: [{ id: "evidence", incidentId: "synthetic", version: 2, sha256: hash, redactedSha256: hash }], findings: [{ id: "accepted", incidentId: "synthetic", verificationStatus: "VERIFIED", evidenceIds: ["evidence"] }], memberships: [{ userId: "reviewer", active: true, role: "COMMANDER", capabilities: ["MANAGE_INCIDENT"] }] } as unknown as IncidentSnapshot;

test("preparation decoder preserves only scoped typed evidence references", () => {
  const parsed = parseGraphReviewPreparation(JSON.stringify({ ...packet, secretField: "omit", evidenceRefs: [{ ...packet.evidenceRefs[0], rawEvidence: "omit" }] }), "synthetic", "descriptive");
  assert.deepEqual(parsed, packet);
  for (const invalid of [{ ...packet, incidentId: "foreign" }, { ...packet, edgeId: "foreign" }, { ...packet, expectedEdgeDigest: 1 }, { ...packet, evidenceRefs: [packet.evidenceRefs[0], packet.evidenceRefs[0]] }, { ...packet, evidenceRefs: [{ ...packet.evidenceRefs[0], version: "2" }] }]) assert.throws(() => parseGraphReviewPreparation(JSON.stringify(invalid), "synthetic", "descriptive"));
});
test("stale, incomplete and foreign evidence preparations cannot be submitted", () => {
  assert.equal(reviewPreparationMatches(snapshot, edge, packet), true);
  assert.equal(reviewPreparationMatches(snapshot, edge, { ...packet, evidenceRefs: [] }), false);
  assert.equal(reviewPreparationMatches(snapshot, edge, { ...packet, evidenceRefs: [{ ...packet.evidenceRefs[0], version: 1 }] }), false);
  assert.equal(reviewPreparationMatches(snapshot, edge, { ...packet, evidenceRefs: [{ ...packet.evidenceRefs[0], redactedSha256: "b".repeat(64) }] }), false);
  assert.equal(reviewPreparationMatches(snapshot, { ...edge, incidentId: "foreign" }, packet), false);
});
test("human verification UI rejects self-review, service roles and unaccepted findings", () => {
  assert.equal(canVerifyGraphRelationship(snapshot, edge, "reviewer", "accepted"), true);
  assert.equal(canVerifyGraphRelationship(snapshot, { ...edge, assertedBy: "reviewer" }, "reviewer", "accepted"), false);
  for (const role of ["AI_SERVICE", "OBSERVER", "INVESTIGATOR"] as const) assert.equal(canVerifyGraphRelationship({ ...snapshot, memberships: [{ ...snapshot.memberships[0], role }] }, edge, "reviewer", "accepted"), false);
  assert.equal(canVerifyGraphRelationship({ ...snapshot, findings: [{ ...snapshot.findings[0], verificationStatus: "HYPOTHESIS" }] }, edge, "reviewer", "accepted"), false);
  assert.equal(canVerifyGraphRelationship(snapshot, { ...edge, verificationStatus: "DISPUTED" }, "reviewer", "accepted"), false);
});
test("descriptive review requires full citation coverage and excludes scenario routes", () => {
  assert.deepEqual(supportingReviewedFindings(snapshot, { ...edge, sourceEvidenceIds: ["evidence", "missing"] }), []);
  assert.deepEqual(supportingReviewedFindings(snapshot, { ...edge, sourceEvidenceIds: [] }), []);
  for (const type of ["COMMUNICATES_WITH", "DEPENDS_ON"] as const) {
    assert.equal(reviewableRelationshipTypes.some(candidate => candidate as string === type), false);
    assert.equal(canVerifyGraphRelationship(snapshot, { ...edge, type }, "reviewer", "accepted"), false);
  }
});
