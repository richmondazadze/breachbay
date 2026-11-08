import type { ApproveActionCommand, BackendSession, CommandResult, ExecuteSimulationCommand, IncidentSnapshot, Proposal } from "@/lib/contracts";

export type ExecutionReceipt = CommandResult<{ id: string }>;
export type AcceptanceVerdict = "NOT_RUN" | "RUNNING" | "PASS" | "FAIL" | "BLOCKED" | "INCONCLUSIVE";
export type AcceptanceMode = "terminal" | "approved";
export type AcceptanceCommand = Readonly<ExecuteSimulationCommand | ApproveActionCommand>;
const terminal = new Set(["VERIFIED_SUCCESS", "VERIFIED_PARTIAL", "VERIFIED_FAILED"]);
export const isVerifiedProposal = (proposal: Proposal) => terminal.has(proposal.status);
export function acceptanceAccess(snapshot: IncidentSnapshot | null, session: BackendSession | null, incidentId: string) {
  return Boolean(snapshot?.incident.id === incidentId && snapshot.incident.classification === "SYNTHETIC" && session?.user.status === "ACTIVE" && snapshot.memberships.some(m => m.incidentId === incidentId && m.active && m.userId === session.user.id && m.role === "COMMANDER" && m.capabilities.includes("EXECUTE_SIMULATION")));
}
export function eligibleApprovedProposal(snapshot: IncidentSnapshot, proposal: Proposal, now = Date.now()) {
  const version = snapshot.incident.scenarioVersion;
  return proposal.incidentId === snapshot.incident.id && proposal.status === "APPROVED" && proposal.expectedVersion === version &&
    ["INVESTIGATING", "CONTAINMENT_PENDING", "CONTAINING"].includes(snapshot.incident.status) &&
    !snapshot.verifications.some(v => v.incidentId === snapshot.incident.id && v.proposalId === proposal.id) &&
    snapshot.simulations.some(b => b.incidentId === snapshot.incident.id && b.id === proposal.simulationId && b.proposalId === proposal.id && b.parentVersion === version && b.payloadDigest === proposal.payloadDigest) &&
    snapshot.approvals.some(a => a.incidentId === snapshot.incident.id && a.proposalId === proposal.id && a.decision === "APPROVE" && a.proposalVersion === proposal.version && a.scenarioVersion === version && a.payloadDigest === proposal.payloadDigest && a.approverId !== proposal.requestedBy && Date.parse(a.expiresAt) > now && snapshot.memberships.some(m => m.incidentId === snapshot.incident.id && m.active && m.role === "COMMANDER" && m.userId === a.approverId));
}
export function eligibleStaleApprovalControl(snapshot: IncidentSnapshot, proposal: Proposal, actorId: string, primaryId: string) {
  return proposal.id !== primaryId && proposal.incidentId === snapshot.incident.id && proposal.status === "PENDING_APPROVAL" && proposal.requestedBy !== actorId && proposal.expectedVersion === snapshot.incident.scenarioVersion &&
    snapshot.simulations.some(b => b.incidentId === snapshot.incident.id && b.id === proposal.simulationId && b.proposalId === proposal.id && b.parentVersion === proposal.expectedVersion && b.payloadDigest === proposal.payloadDigest) &&
    snapshot.memberships.some(m => m.incidentId === snapshot.incident.id && m.userId === actorId && m.active && m.role === "COMMANDER" && m.capabilities.includes("APPROVE"));
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
const sorted = <T extends { id: string }>(items: T[]) => [...items].sort((a, b) => a.id.localeCompare(b.id));
/** Only scoped operational state, never credentials. Receipt validation uses a
 * newly applied subscription, not the cached snapshot that preceded the call. */
export function acceptanceSample(snapshot: IncidentSnapshot, incidentId: string) {
  if (snapshot.incident.id !== incidentId || snapshot.incident.classification !== "SYNTHETIC" || !Number.isInteger(snapshot.incident.scenarioVersion) || snapshot.incident.scenarioVersion < 1) throw new Error("Scoped synthetic state is unavailable.");
  for (const rows of [snapshot.proposals, snapshot.approvals, snapshot.verifications, snapshot.assets, snapshot.edges, snapshot.scenarioHistory ?? [], snapshot.auditEvents]) {
    if (rows.some(row => row.incidentId !== incidentId)) throw new Error("Subscription contains foreign incident state.");
  }
  return {
    incidentId,
    scenarioVersion: snapshot.incident.scenarioVersion,
    incidentVersion: snapshot.incident.version,
    incidentStatus: snapshot.incident.status,
    proposals: sorted(snapshot.proposals),
    approvals: sorted(snapshot.approvals),
    verifications: sorted(snapshot.verifications),
    mutableState: stable({ assets: sorted(snapshot.assets), edges: sorted(snapshot.edges) }),
    history: sorted(snapshot.scenarioHistory ?? []),
    executionAudit: sorted(snapshot.auditEvents.filter(a => ["executeSimulation", "simulationVerified", "approveAction"].includes(a.verb))),
  };
}
export type AcceptanceSample = ReturnType<typeof acceptanceSample>;
export interface AcceptanceCheck { verdict: AcceptanceVerdict; detail: string }
export interface AcceptanceStep extends AcceptanceCheck {
  kind: "stale" | "execute" | "replay" | "terminal" | "stale-approval";
  label: string;
  command: AcceptanceCommand;
  receipt?: ExecutionReceipt;
  before?: AcceptanceSample;
  after?: AcceptanceSample;
}
export interface ExecutionAcceptanceRun extends AcceptanceCheck {
  mode: AcceptanceMode;
  incidentId: string;
  actorId: string;
  proposalId: string;
  baseline: AcceptanceSample;
  steps: AcceptanceStep[];
  validExecutionAttempted: boolean;
}
const check = (verdict: AcceptanceVerdict, detail: string): AcceptanceCheck => ({ verdict, detail });
const unchanged = (before: AcceptanceSample, after: AcceptanceSample) => stable(before) === stable(after);
function receiptFailure(receipt: ExecutionReceipt): AcceptanceCheck | null {
  if (receipt.ok) return null;
  if (["UNAUTHENTICATED", "FORBIDDEN", "APPROVAL_EXPIRED"].includes(receipt.error.code)) return check("BLOCKED", "Server authentication or authorization denied this attempt. Acceptance is not established.");
  if (receipt.error.code === "DEPENDENCY_UNAVAILABLE") return check("INCONCLUSIVE", "No confirmed execution outcome. Inspect server state before any retry.");
  return null;
}
export function validateRejection(command: AcceptanceCommand, receipt: ExecutionReceipt, expected: "INVALID_TRANSITION" | "VERSION_CONFLICT", before: AcceptanceSample, after: AcceptanceSample): AcceptanceCheck {
  const failure = receiptFailure(receipt);
  if (failure) return failure;
  if (receipt.correlationId !== command.correlationId || receipt.ok || receipt.error.code !== expected) return check("FAIL", `Expected ${expected}; the actual typed receipt did not match.`);
  if (!unchanged(before, after)) return check("INCONCLUSIVE", "Scoped scenario, proposal, approval, verification or execution state changed. Check for concurrent work; rejection alone is not proof.");
  return check("PASS", `${expected} confirmed; a fresh subscription confirms unchanged scoped state and counts.`);
}
export function validateExecution(run: ExecutionAcceptanceRun, command: AcceptanceCommand, receipt: ExecutionReceipt, before: AcceptanceSample, after: AcceptanceSample): AcceptanceCheck {
  const failure = receiptFailure(receipt);
  if (failure) return failure;
  if (!receipt.ok || !receipt.data.id || !receipt.auditEventId || receipt.correlationId !== command.correlationId) return check("FAIL", "Execution did not return a complete committed verification/audit receipt.");
  const prior = before.proposals.find(p => p.id === run.proposalId);
  const proposal = after.proposals.find(p => p.id === run.proposalId);
  const created = after.verifications.filter(v => !before.verifications.some(old => old.id === v.id));
  const verification = created[0];
  const content = (p: Proposal) => { const { status: _status, version: _version, updatedAt: _time, ...rest } = p; return rest; };
  const executionAudit = after.executionAudit.find(a => a.id === receipt.auditEventId);
  const executionSnapshots = after.history.filter(h => h.operation === "EXECUTION" && h.proposalId === run.proposalId && !before.history.some(prior => prior.id === h.id));
  const saved = executionSnapshots[0];
  if (after.scenarioVersion !== before.scenarioVersion + 1 || before.proposals.length !== after.proposals.length || stable(before.proposals.filter(p => p.id !== run.proposalId)) !== stable(after.proposals.filter(p => p.id !== run.proposalId))) return check("INCONCLUSIVE", "Concurrent scenario or proposal changes prevent an isolated execution assertion. Inspect scoped records.");
  const valid = before.incidentId === after.incidentId && after.scenarioVersion === before.scenarioVersion + 1 && after.incidentVersion === before.incidentVersion + 1 &&
    prior && proposal && prior.status === "APPROVED" && proposal.status === "VERIFIED_SUCCESS" && proposal.version === prior.version + 1 && stable(content(prior)) === stable(content(proposal)) &&
    before.proposals.length === after.proposals.length && stable(before.proposals.filter(p => p.id !== run.proposalId)) === stable(after.proposals.filter(p => p.id !== run.proposalId)) &&
    stable(before.approvals) === stable(after.approvals) &&
    after.verifications.length === before.verifications.length + 1 && created.length === 1 && verification.id === receipt.data.id && verification.proposalId === run.proposalId && verification.incidentId === run.incidentId && verification.observedVersion === after.scenarioVersion && verification.status === proposal.status &&
    stable(before.verifications) === stable(after.verifications.filter(v => v.id !== verification.id)) &&
    executionSnapshots.length === 1 && saved.incidentId === run.incidentId && saved.scenarioVersion === after.scenarioVersion && saved.parentVersion === before.scenarioVersion && saved.createdBy === run.actorId && /^[a-f0-9]{64}$/i.test(saved.stateDigest) &&
    after.executionAudit.some(a => a.verb === "simulationVerified" && a.incidentId === run.incidentId && a.objectId === verification.id && a.correlationId === command.correlationId) &&
    executionAudit?.verb === "executeSimulation" && executionAudit.incidentId === run.incidentId && executionAudit.objectId === verification.id && executionAudit.actorId === run.actorId && executionAudit.correlationId === command.correlationId;
  return valid ? check("PASS", "Fresh scoped state confirms VERIFIED_SUCCESS, one scenario advance, one new verification, the immutable execution snapshot and the committed audit.") : check("FAIL", "Receipt and fresh scoped state do not prove exactly one verified successful execution. Inspect records and concurrent work.");
}
export function validateReplay(command: AcceptanceCommand, receipt: ExecutionReceipt, original: ExecutionReceipt, before: AcceptanceSample, after: AcceptanceSample): AcceptanceCheck {
  const failure = receiptFailure(receipt);
  if (failure) return failure;
  if (!receipt.ok || !original.ok || !original.auditEventId || receipt.data.id !== original.data.id || receipt.auditEventId !== original.auditEventId || receipt.correlationId !== original.correlationId || receipt.correlationId !== command.correlationId) return check("FAIL", "Same-key replay did not return the original verification ID and historical audit receipt.");
  if (!unchanged(before, after)) return check("INCONCLUSIVE", "Scoped state, counts or execution audit changed during replay. Inspect concurrent work; unchanged state is not established.");
  return check("PASS", "Exact request replay returned the same historical verification/audit receipt; fresh scoped state is unchanged.");
}
export function createExecutionAcceptance(mode: AcceptanceMode, snapshot: IncidentSnapshot, proposalId: string, actorId: string, nextId: () => string, controlId?: string): ExecutionAcceptanceRun {
  const baseline = acceptanceSample(snapshot, snapshot.incident.id);
  const proposal = snapshot.proposals.find(p => p.id === proposalId && p.incidentId === snapshot.incident.id);
  if (!proposal || (mode === "terminal" ? !isVerifiedProposal(proposal) : !eligibleApprovedProposal(snapshot, proposal))) throw new Error("Selected proposal is no longer eligible. Review current scoped state.");
  if (mode === "approved" && baseline.scenarioVersion < 2) throw new Error("A prior scenario version is required for the stale-version check.");
  const command = (version: number) => Object.freeze({ incidentId: snapshot.incident.id, proposalId, expectedVersion: version, idempotencyKey: nextId(), correlationId: nextId() });
  const step = (kind: AcceptanceStep["kind"], label: string, args: AcceptanceCommand): AcceptanceStep => ({ kind, label, command: args, verdict: "NOT_RUN", detail: "Not sent." });
  const once = mode === "approved" ? command(baseline.scenarioVersion) : null;
  const control = controlId ? snapshot.proposals.find(p => p.id === controlId) : undefined;
  if (controlId && (!once || !control || !eligibleStaleApprovalControl(snapshot, control, actorId, proposalId))) throw new Error("Stale approval control is no longer eligible; no command was sent.");
  const approvalStep = control ? [step("stale-approval", "Reject the separate stale approval control", Object.freeze({
    incidentId: snapshot.incident.id, proposalId: control.id, expectedVersion: baseline.scenarioVersion, proposalVersion: control.version,
    decision: "APPROVE" as const, justification: "Synthetic acceptance negative: approval bound to the prior scenario must be rejected.", idempotencyKey: nextId(), correlationId: nextId(),
  }))] : [];
  return {
    mode, incidentId: snapshot.incident.id, actorId, proposalId, baseline, verdict: "RUNNING", detail: "Awaiting commands.", validExecutionAttempted: false,
    steps: once ? [
      step("stale", "Reject stale execution while approved", command(baseline.scenarioVersion - 1)),
      step("execute", "Execute approved synthetic response once", once),
      step("replay", "Replay the exact key and payload", once),
      step("terminal", "Reject a new-key terminal duplicate", command(baseline.scenarioVersion + 1)),
      ...approvalStep,
    ] : [step("terminal", "Reject a new-key terminal duplicate", command(baseline.scenarioVersion))],
  };
}
export interface ExecutionAcceptanceIO {
  isCurrent(): boolean;
  send(command: AcceptanceCommand): Promise<ExecutionReceipt>;
  freshSnapshot(): Promise<IncidentSnapshot>;
  updated(): void;
}
/** Stop on any unconfirmed, denied, changed or interrupted outcome. In
 * particular, an unknown positive outcome is never retried automatically. */
export async function runExecutionAcceptance(run: ExecutionAcceptanceRun, io: ExecutionAcceptanceIO) {
  let before = run.baseline;
  let original: ExecutionReceipt | undefined;
  try {
    for (const step of run.steps) {
      if (!io.isCurrent()) throw new Error("Live authorized scope changed; remaining commands were not sent.");
      if (step.kind === "stale-approval") {
        const control = before.proposals.find(p => p.id === step.command.proposalId);
        const captured = step.command;
        if (!original?.ok || before.scenarioVersion !== run.baseline.scenarioVersion + 1 || captured.expectedVersion !== run.baseline.scenarioVersion || !("decision" in captured) || !control || control.status !== "PENDING_APPROVAL" || control.version !== captured.proposalVersion || control.expectedVersion !== captured.expectedVersion || control.requestedBy === run.actorId) {
          const blocked = check("BLOCKED", "Separate stale approval control changed or the scenario advance is unconfirmed. Approval request NOT SENT.");
          Object.assign(step, blocked); Object.assign(run, blocked); io.updated(); return;
        }
      }
      run.detail = `${step.label}: requesting typed server receipt.`;
      step.before = before;
      step.verdict = "RUNNING";
      if (step.kind === "execute") run.validExecutionAttempted = true;
      io.updated();
      const receipt = await io.send(step.command);
      if (!io.isCurrent()) throw new Error("Session, access or connection changed during the request. Acceptance is not established.");
      step.receipt = receipt;
      const denied = receiptFailure(receipt);
      if (denied) {
        Object.assign(step, denied); Object.assign(run, denied); io.updated(); return;
      }
      run.detail = `${step.label}: refreshing the normal scoped subscription to verify state.`;
      io.updated();
      const after = acceptanceSample(await io.freshSnapshot(), run.incidentId);
      if (!io.isCurrent()) throw new Error("Live authorized scope changed during state confirmation.");
      step.after = after;
      const result = step.kind === "execute" ? validateExecution(run, step.command, receipt, before, after) : step.kind === "replay" && original ? validateReplay(step.command, receipt, original, before, after) : validateRejection(step.command, receipt, step.kind === "stale" || step.kind === "stale-approval" ? "VERSION_CONFLICT" : "INVALID_TRANSITION", before, after);
      Object.assign(step, result);
      run.detail = result.detail;
      run.verdict = result.verdict === "PASS" ? "RUNNING" : result.verdict;
      io.updated();
      if (result.verdict !== "PASS") return;
      if (step.kind === "execute") original = receipt;
      before = after;
    }
    Object.assign(run, check("PASS", run.mode === "terminal" ? "Terminal duplicate rejected with unchanged subscribed state. Stale-version and stale-approval gates NOT TESTED in this mode." : `Stale approved execution rejected; one execution verified; exact replay returned the historical receipt; terminal duplicate rejected. ${run.steps.some(s => s.kind === "stale-approval") ? "Separate stale approval rejected with unchanged state." : "Stale approval NOT TESTED (no control selected)."}`));
  } catch (error) {
    const result = check("INCONCLUSIVE", error instanceof Error ? error.message : "Outcome unknown. Inspect server state before retrying.");
    Object.assign(run, result);
    const pending = run.steps.find(s => s.verdict === "RUNNING");
    if (pending) Object.assign(pending, result);
  }
  io.updated();
}
