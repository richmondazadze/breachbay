import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { executionReplayUnavailable, replayRecordedExecution } from "../../src/hooks/execution-replay";
import { credentialCompromiseScenario } from "../../src/lib/simulation/scenario";
import { simulateResponse } from "../../src/lib/simulation/engine";
import type { Proposal, ScenarioSnapshot } from "../../src/lib/contracts";
const incidentId = "synthetic-replay";
const before = credentialCompromiseScenario(incidentId);
const proposal = { id: "recorded-proposal", incidentId, expectedVersion: 1, action: { type: "ISOLATE_SIMULATED_HOST", targetIds: ["app-host"] } } as Proposal;
const after = simulateResponse(before, proposal.action, before.version).nextState;
const digest = (json: string) => createHash("sha256").update(json).digest("hex");
const parentJson = JSON.stringify(before), targetJson = JSON.stringify(after);
const parent = { id: "saved-parent", incidentId, scenarioVersion: 1, operation: "INITIAL", stateDigest: digest(parentJson) } as ScenarioSnapshot;
const target = { id: "saved-target", incidentId, scenarioVersion: 2, parentVersion: 1, operation: "EXECUTION", proposalId: proposal.id, stateDigest: digest(targetJson) } as ScenarioSnapshot;
const input = { incidentId, parent, target, proposal, parentJson, targetJson };
test("recorded execution replay recomputes SAME isolation/dependency rules from saved parent without mutation", async () => {
  const result = await replayRecordedExecution(input);
  assert.equal(result.match, true); assert.equal(result.preview.parentVersion, 1); assert.equal(result.preview.nextState.version, 2);
  assert.ok(result.preview.after.disruptedServiceIds.includes("customer-portal")); assert.ok(result.preview.after.unresolvedProtectedAssetIds.includes("database"));
  assert.deepEqual(result.preview.nextState, after); assert.equal(before.assets.find(a => a.id === "app-host")?.state, "ACTIVE");
});
test("tampered bytes/digests, wrong parent, scope, version and schema fail closed", async () => {
  await assert.rejects(replayRecordedExecution({ ...input, targetJson: targetJson.replace("ISOLATED", "ACTIVE") }), /integrity mismatch/);
  await assert.rejects(replayRecordedExecution({ ...input, parent: { ...parent, scenarioVersion: 0 } }), /parent/);
  await assert.rejects(replayRecordedExecution({ ...input, incidentId: "foreign" }), /scope/);
  const malformed = JSON.stringify({ ...before, assets: [before.assets[0], before.assets[0]] });
  await assert.rejects(replayRecordedExecution({ ...input, parentJson: malformed, parent: { ...parent, stateDigest: digest(malformed) } }));
  const extra = JSON.stringify({ ...before, arbitraryPayload: "do not accept" });
  await assert.rejects(replayRecordedExecution({ ...input, parentJson: extra, parent: { ...parent, stateDigest: digest(extra) } }), /schema/);
});
test("accurately hashed but different target is an honest mismatch, never manufactured success", async () => {
  const altered = structuredClone(after); altered.edges.find(e => e.id === "ws-app")!.enabled = true;
  const json = JSON.stringify(altered);
  const result = await replayRecordedExecution({ ...input, targetJson: json, target: { ...target, stateDigest: digest(json) } });
  assert.equal(result.match, false); assert.ok(result.mismatches.some(m => m.includes("ws-app")));
});
test("missing historical action/parent and nonexecution operations are explicitly unavailable", () => {
  assert.match(executionReplayUnavailable(target, [], [proposal])!, /parent snapshot is unavailable/);
  assert.match(executionReplayUnavailable(target, [parent], [])!, /historical action/);
  assert.match(executionReplayUnavailable({ ...target, operation: "RESTORE" }, [parent], [proposal])!, /snapshot inspection/);
});
