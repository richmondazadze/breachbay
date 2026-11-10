import test from "node:test";
import assert from "node:assert/strict";
import { previewIsFresh, targetMatchesPreview, responseAvailability, retryableCommandMeta } from "../../src/hooks/operational-response-state";
import type { OperationalResponse, OperationalTarget, ResponsePreview } from "../../src/lib/response/contract";
const now = Date.parse("2026-11-09T12:00:00Z");
const preview: ResponsePreview = { kind: "PREVIEW", incidentId: "i", connectorId: "c", assetId: "a", observation: { instanceId: "one", version: 1, loginEnabled: true, observedAt: new Date(now).toISOString() }, impact: "Login disruption", limitation: "Owned application only" };
const target: OperationalTarget = { id: "t", incidentId: "i", connectorId: "c", assetId: "a", name: "Application", owner: "Team", criticality: "HIGH", active: true, version: 3, instanceId: "one", reviewedBy: "commander", reviewedAt: new Date(now).toISOString() };
const response = { status: "APPROVED", expectedTargetVersion: 3, instanceId: "one", approvalExpiresAt: new Date(now + 900000).toISOString() } as OperationalResponse;
test("preview deadlines reject stale, invalid and future observations", () => {
  assert(previewIsFresh(preview, now + 120000));
  assert(!previewIsFresh(preview, now + 120001));
  assert(!previewIsFresh(preview, now - 5001));
  assert(!previewIsFresh({ ...preview, observation: { ...preview.observation, observedAt: "invalid" } }, now));
});
test("retired targets and changed instances need a new scope review", () => {
  assert(targetMatchesPreview(target, preview));
  assert(!targetMatchesPreview({ ...target, active: false }, preview));
  assert(!targetMatchesPreview({ ...target, instanceId: "replacement" }, preview));
  assert(responseAvailability(response, target, now).withdrawable);
  assert(responseAvailability(response, target, now + 900000).expired);
  assert(responseAvailability(response, { ...target, version: 4 }, now).targetChanged);
  assert(responseAvailability(response, { ...target, active: false }, now).targetChanged);
  assert(!responseAvailability({ ...response, executionId: "effect", status: "EXECUTING" }, target, now).withdrawable);
});
test("retry keeps exact review identity; changed proof or target version requires a new command", () => {
  const meta = retryableCommandMeta();
  const reviewed = { proofJson: JSON.stringify(preview), signature: "signed", expectedVersion: 3 };
  const first = meta("register", reviewed);
  assert.deepEqual(meta("register", { ...reviewed }), first);
  assert.notEqual(meta("register", { ...reviewed, expectedVersion: 4 }).idempotencyKey, first.idempotencyKey);
  assert.notEqual(meta("register", { ...reviewed, proofJson: "refreshed" }).idempotencyKey, first.idempotencyKey);
});
