import test from "node:test";
import assert from "node:assert/strict";
import type { BackendSession, IncidentSnapshot } from "../../src/lib/contracts";
import { acceptanceAccess, acceptanceSample, createExecutionAcceptance, eligibleStaleApprovalControl, runExecutionAcceptance, validateExecution, validateRejection, validateReplay, type AcceptanceCommand, type ExecutionReceipt } from "../../src/hooks/execution-acceptance";

// Explicit synthetic test records; no live client, credentials or fixture seed.
function snapshot(): IncidentSnapshot {
  return {
    incident: { id: "test", classification: "SYNTHETIC", scenarioVersion: 4, version: 7, status: "CONTAINING" },
    memberships: [{ id: "member", incidentId: "test", userId: "commander", role: "COMMANDER", active: true, capabilities: ["EXECUTE_SIMULATION", "APPROVE"] }],
    proposals: [{ id: "primary", incidentId: "test", requestedBy: "investigator", status: "APPROVED", expectedVersion: 4, version: 5, simulationId: "preview", payloadDigest: "payload", action: { type: "ISOLATE_SIMULATED_HOST", targetIds: ["app"] }, updatedAt: "before" }],
    approvals: [{ id: "approval", incidentId: "test", proposalId: "primary", decision: "APPROVE", approverId: "commander", scenarioVersion: 4, proposalVersion: 5, payloadDigest: "payload", expiresAt: "2099-01-01T00:00:00Z" }],
    simulations: [{ id: "preview", incidentId: "test", proposalId: "primary", parentVersion: 4, payloadDigest: "payload" }],
    verifications: [], assets: [{ id: "app", incidentId: "test", state: "COMPROMISED", version: 1 }], edges: [], scenarioHistory: [], auditEvents: [],
  } as unknown as IncidentSnapshot;
}
const ids = () => { let n = 0; return () => `synthetic-key-${++n}`; };
const success = (command: AcceptanceCommand): ExecutionReceipt => ({ ok: true, data: { id: "verification" }, auditEventId: "execution-audit", correlationId: command.correlationId });
const rejection = (command: AcceptanceCommand, code: "INVALID_TRANSITION" | "VERSION_CONFLICT" | "UNAUTHENTICATED" | "FORBIDDEN" | "DEPENDENCY_UNAVAILABLE"): ExecutionReceipt => ({ ok: false, error: { code, message: "Synthetic rejection", retryable: false }, correlationId: command.correlationId });
function afterExecution(before: IncidentSnapshot, command: AcceptanceCommand) {
  const after = structuredClone(before);
  after.incident.scenarioVersion = 5; after.incident.version++;
  after.proposals[0].status = "VERIFIED_SUCCESS"; after.proposals[0].version++; after.proposals[0].updatedAt = "after";
  after.verifications.push({ id: "verification", incidentId: "test", proposalId: "primary", status: "VERIFIED_SUCCESS", expectedVersion: 5, observedVersion: 5, summary: "Synthetic test", createdAt: "after" });
  after.auditEvents.push({ id: "execution-audit", incidentId: "test", actorId: "commander", verb: "executeSimulation", objectId: "verification", correlationId: command.correlationId, createdAt: "after", previousHash: "", hash: "", detail: "" });
  after.auditEvents.push({ ...after.auditEvents[0], id: "verification-audit", verb: "simulationVerified" });
  after.scenarioHistory!.push({ id: "execution-snapshot", incidentId: "test", scenarioVersion: 5, parentVersion: 4, operation: "EXECUTION", proposalId: "primary", stateDigest: "a".repeat(64), createdBy: "commander", createdAt: "after" });
  return after;
}
function withControl() {
  const state = snapshot();
  state.proposals.push({ ...state.proposals[0], id: "control", status: "PENDING_APPROVAL", simulationId: "control-preview" });
  state.simulations.push({ ...state.simulations[0], id: "control-preview", proposalId: "control" });
  return state;
}

test("access requires the active scoped human commander and a synthetic incident", () => {
  const state = snapshot();
  const session = { user: { id: "commander", status: "ACTIVE" } } as BackendSession;
  assert.equal(acceptanceAccess(state, session, "test"), true);
  assert.equal(acceptanceAccess(state, session, "foreign"), false);
  assert.equal(acceptanceAccess(state, { ...session, user: { ...session.user, id: "unknown" } }, "test"), false);
  state.memberships[0].role = "AI_SERVICE";
  assert.equal(acceptanceAccess(state, session, "test"), false);
});
test("typed rejection alone cannot pass after a count, proposal, approval or scenario change", () => {
  const before = snapshot(); const run = createExecutionAcceptance("approved", before, "primary", "commander", ids());
  const cmd = run.steps[0].command; const sample = acceptanceSample(before, "test");
  assert.equal(validateRejection(cmd, rejection(cmd, "VERSION_CONFLICT"), "VERSION_CONFLICT", sample, sample).verdict, "PASS");
  for (const mutate of [
    (s: IncidentSnapshot) => s.incident.scenarioVersion++,
    (s: IncidentSnapshot) => s.proposals[0].version++,
    (s: IncidentSnapshot) => s.proposals.push({ ...s.proposals[0], id: "new" }),
    (s: IncidentSnapshot) => s.approvals.push({ ...s.approvals[0], id: "new" }),
    (s: IncidentSnapshot) => s.assets[0].state = "ISOLATED",
  ]) {
    const changed = structuredClone(before); mutate(changed);
    assert.equal(validateRejection(cmd, rejection(cmd, "VERSION_CONFLICT"), "VERSION_CONFLICT", sample, acceptanceSample(changed, "test")).verdict, "INCONCLUSIVE");
  }
  assert.equal(validateRejection(cmd, rejection(cmd, "INVALID_TRANSITION"), "VERSION_CONFLICT", sample, sample).verdict, "FAIL");
  const foreign = structuredClone(before); foreign.proposals[0].incidentId = "foreign";
  assert.throws(() => acceptanceSample(foreign, "test"), /foreign/);
});
test("auth failures and unconfirmed outcomes never satisfy rejection or replay checks", () => {
  const state = snapshot(); const run = createExecutionAcceptance("approved", state, "primary", "commander", ids()); const cmd = run.steps[0].command; const sample = acceptanceSample(state, "test");
  for (const code of ["UNAUTHENTICATED", "FORBIDDEN", "DEPENDENCY_UNAVAILABLE"] as const) {
    assert.notEqual(validateRejection(cmd, rejection(cmd, code), "VERSION_CONFLICT", sample, sample).verdict, "PASS");
    assert.notEqual(validateReplay(cmd, rejection(cmd, code), success(cmd), sample, sample).verdict, "PASS");
  }
});
test("execution requires one new scoped verification, one version advance and its real audit receipt", () => {
  const before = snapshot(); const run = createExecutionAcceptance("approved", before, "primary", "commander", ids()); const cmd = run.steps[1].command; const after = afterExecution(before, cmd);
  const check = (s: IncidentSnapshot, receipt = success(cmd)) => validateExecution(run, cmd, receipt, acceptanceSample(before, "test"), acceptanceSample(s, "test")).verdict;
  assert.equal(check(after), "PASS");
  const double = structuredClone(after); double.incident.scenarioVersion = 6;
  assert.equal(check(double), "INCONCLUSIVE");
  const added = structuredClone(after); added.verifications.push({ ...added.verifications[0], id: "duplicate" });
  assert.equal(check(added), "FAIL");
  const wrongAudit = structuredClone(after); wrongAudit.auditEvents[0].actorId = "other";
  assert.equal(check(wrongAudit), "FAIL");
  assert.equal(check(after, { ...success(cmd), auditEventId: "wrong" } as ExecutionReceipt), "FAIL");
  const noSnapshot = structuredClone(after); noSnapshot.scenarioHistory = [];
  assert.equal(check(noSnapshot), "FAIL");
  const partial = structuredClone(after); partial.proposals[0].status = "VERIFIED_PARTIAL"; partial.verifications[0].status = "VERIFIED_PARTIAL";
  assert.equal(check(partial), "FAIL");
});
test("replay must return the same historical verification and audit without state or count changes", () => {
  const before = snapshot(); const run = createExecutionAcceptance("approved", before, "primary", "commander", ids()); const cmd = run.steps[1].command; const after = afterExecution(before, cmd); const sample = acceptanceSample(after, "test"); const receipt = success(cmd);
  assert.equal(validateReplay(cmd, receipt, receipt, sample, sample).verdict, "PASS");
  assert.equal(validateReplay(cmd, { ...receipt, auditEventId: "new-audit" } as ExecutionReceipt, receipt, sample, sample).verdict, "FAIL");
  const changed = structuredClone(after); changed.verifications[0].observedVersion++;
  assert.equal(validateReplay(cmd, receipt, receipt, sample, acceptanceSample(changed, "test")).verdict, "INCONCLUSIVE");
});
test("bounded approved sequence reuses the exact object and payload, with stale approval strictly after advance", async () => {
  const before = withControl(); const run = createExecutionAcceptance("approved", before, "primary", "commander", ids(), "control"); const once = run.steps[1].command; const after = afterExecution(before, once); let calls = 0; let refreshes = 0;
  await runExecutionAcceptance(run, {
    isCurrent: () => true, updated: () => { if (calls < 5 && run.steps.some(s => s.verdict === "NOT_RUN" || s.verdict === "RUNNING")) assert.notEqual(run.verdict, "PASS"); },
    send: async cmd => {
      const step = run.steps[calls++]; assert.equal(cmd, step.command);
      if (calls === 3) { assert.equal(cmd, once); assert.equal(JSON.stringify(cmd), JSON.stringify(once)); }
      if ("decision" in cmd) { assert.equal(refreshes, 4); assert.equal(cmd.expectedVersion, 4); assert.equal(cmd.proposalVersion, 5); return rejection(cmd, "VERSION_CONFLICT"); }
      return step.kind === "execute" || step.kind === "replay" ? success(cmd) : rejection(cmd, step.kind === "stale" ? "VERSION_CONFLICT" : "INVALID_TRANSITION");
    },
    freshSnapshot: async () => (++refreshes === 1 ? before : after),
  });
  assert.equal(calls, 5); assert.equal(refreshes, 5); assert.equal(run.verdict, "PASS"); assert.equal(run.validExecutionAttempted, true);
});
test("unknown positive outcome retains its command and stops before replay or further approval requests", async () => {
  const before = withControl(); const run = createExecutionAcceptance("approved", before, "primary", "commander", ids(), "control"); const captured = run.steps[1].command; let calls = 0;
  await runExecutionAcceptance(run, { isCurrent: () => true, updated: () => {}, freshSnapshot: async () => before, send: async cmd => { if (++calls === 1) return rejection(cmd, "VERSION_CONFLICT"); throw new Error("Outcome unknown"); } });
  assert.equal(calls, 2); assert.equal(run.verdict, "INCONCLUSIVE"); assert.equal(run.validExecutionAttempted, true); assert.equal(run.steps[1].command, captured); assert.equal(run.steps[2].verdict, "NOT_RUN"); assert.equal(run.steps[4].verdict, "NOT_RUN");
});
test("late receipts after lost live scope and failed fresh subscriptions cannot produce a pass", async () => {
  const state = snapshot(); state.proposals[0].status = "VERIFIED_SUCCESS";
  const run = createExecutionAcceptance("terminal", state, "primary", "commander", ids()); let live = true; let reads = 0;
  await runExecutionAcceptance(run, { isCurrent: () => live, updated: () => {}, freshSnapshot: async () => { reads++; return state; }, send: async cmd => { live = false; return rejection(cmd, "INVALID_TRANSITION"); } });
  assert.equal(reads, 0); assert.equal(run.verdict, "INCONCLUSIVE");
  const next = createExecutionAcceptance("terminal", state, "primary", "commander", ids());
  await runExecutionAcceptance(next, { isCurrent: () => true, updated: () => {}, freshSnapshot: async () => { throw new Error("Fresh subscription failed"); }, send: async cmd => rejection(cmd, "INVALID_TRANSITION") });
  assert.equal(next.verdict, "INCONCLUSIVE");
});
test("optional stale approval control cannot pass on authorization failure, self-request or changed control state", async () => {
  const before = withControl();
  const self = structuredClone(before); self.proposals[1].requestedBy = "commander";
  assert.equal(eligibleStaleApprovalControl(self, self.proposals[1], "commander", "primary"), false);
  assert.throws(() => createExecutionAcceptance("approved", self, "primary", "commander", ids(), "control"), /control/);
  const run = createExecutionAcceptance("approved", before, "primary", "commander", ids(), "control"); const after = afterExecution(before, run.steps[1].command); let calls = 0;
  await runExecutionAcceptance(run, { isCurrent: () => true, updated: () => {}, freshSnapshot: async () => calls === 1 ? before : after, send: async cmd => { const kind = run.steps[calls++].kind; return "decision" in cmd ? rejection(cmd, "UNAUTHENTICATED") : kind === "execute" || kind === "replay" ? success(cmd) : rejection(cmd, kind === "stale" ? "VERSION_CONFLICT" : "INVALID_TRANSITION"); } });
  assert.equal(calls, 5); assert.equal(run.verdict, "BLOCKED"); assert.equal(run.steps[4].verdict, "BLOCKED");
  const command = run.steps[4].command; const changed = structuredClone(after); changed.proposals[1].status = "APPROVED"; changed.proposals[1].version++;
  assert.equal(validateRejection(command, rejection(command, "VERSION_CONFLICT"), "VERSION_CONFLICT", acceptanceSample(after, "test"), acceptanceSample(changed, "test")).verdict, "INCONCLUSIVE");
});
