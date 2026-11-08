"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { IncidentSnapshot } from "@/lib/contracts";
import { useIncident, type IncidentClient } from "@/hooks/use-incident";
import { acceptanceAccess, createExecutionAcceptance, eligibleApprovedProposal, eligibleStaleApprovalControl, isVerifiedProposal, runExecutionAcceptance, type AcceptanceMode, type ExecutionAcceptanceRun, type ExecutionReceipt } from "@/hooks/execution-acceptance";
import { AuthenticationRecovery } from "./auth/authentication-recovery";
import { ConnectionStatus } from "./connection-status";
import { IncidentHeading } from "./incident-heading";
import { Button } from "./ui/button";

interface ActiveAttempt { generation: number; actorId: string; client: IncidentClient }
interface FreshSubscription {
  revision: number;
  seenReset: boolean;
  priorSession: object | null;
  timer: ReturnType<typeof setTimeout>;
  attempt: ActiveAttempt;
  resolve(snapshot: IncidentSnapshot): void;
  reject(error: Error): void;
}
/** Separate, explicit acceptance workflow. All transport and authorization use
 * the same normal browser client as the product, with no token access here. */
export function ExecutionAcceptance({ incidentId, client }: { incidentId: string; client?: IncidentClient }) {
  const [revision, setRevision] = useState(0);
  // Changing only this observer identity reopens useIncident's normal session
  // and subscription. The original browser client and its methods stay fixed.
  const observer = useMemo(() => client ? { ...client } : undefined, [client, revision]);
  const state = useIncident(incidentId, observer);
  const current = useRef({ state, client, incidentId });
  current.current = { state, client, incidentId };
  const generation = useRef(0);
  const mounted = useRef(false);
  const activeAttempt = useRef<ActiveAttempt | null>(null);
  const waiter = useRef<FreshSubscription | null>(null);
  const nextRevision = useRef(0);
  // Command keys/payloads and receipts stay only in component refs. Nothing
  // survives navigation, logout or refresh, and no browser storage is used.
  const record = useRef<ExecutionAcceptanceRun | null>(null);
  const capturedExecution = useRef<ExecutionAcceptanceRun["steps"][number]["command"] | null>(null);
  const [terminalId, setTerminalId] = useState("");
  const [approvedId, setApprovedId] = useState("");
  const [controlId, setControlId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [, renderRecord] = useState(0);
  const paint = () => { if (mounted.current) renderRecord(n => n + 1); };
  const isCurrent = (attempt: ActiveAttempt) => {
    const latest = current.current;
    return mounted.current && activeAttempt.current === attempt && generation.current === attempt.generation && latest.client === attempt.client && latest.incidentId === incidentId && latest.state.connection === "live" && latest.state.session?.user.id === attempt.actorId && acceptanceAccess(latest.state.snapshot, latest.state.session, incidentId);
  };
  const rejectWaiter = (message: string) => {
    const pending = waiter.current;
    if (!pending) return;
    waiter.current = null;
    clearTimeout(pending.timer);
    pending.reject(new Error(message));
  };

  useEffect(() => {
    mounted.current = true;
    generation.current++;
    setBusy(false); setNotice(""); setTerminalId(""); setApprovedId(""); setControlId("");
    const clear = () => {
      generation.current++;
      activeAttempt.current = null;
      rejectWaiter("Session ended. Acceptance results and captured commands were cleared.");
      record.current = null;
      capturedExecution.current = null;
      if (mounted.current) { setBusy(false); setNotice("Session ended. Sign in and review current server state."); paint(); }
    };
    window.addEventListener("breachbay-session-ending", clear);
    return () => {
      mounted.current = false;
      generation.current++;
      activeAttempt.current = null;
      rejectWaiter("Acceptance page scope changed; no further commands were sent.");
      record.current = null;
      capturedExecution.current = null;
      window.removeEventListener("breachbay-session-ending", clear);
    };
  }, [incidentId, client]);

  useEffect(() => {
    const pending = waiter.current;
    if (pending && pending.revision === revision) {
      // A revision first renders with the preceding hook state. Never resolve
      // that cached state as a fresh subscription; require reset + new session.
      if (!state.session || state.connection !== "live") pending.seenReset = true;
      if (pending.seenReset && state.connection === "live" && state.snapshot && state.session !== pending.priorSession) {
        if (!isCurrent(pending.attempt)) { rejectWaiter("Fresh subscription did not retain the authorized human commander scope."); return; }
        waiter.current = null;
        clearTimeout(pending.timer);
        pending.resolve(state.snapshot);
      } else if (pending.seenReset && state.connection === "disconnected" && state.error) {
        rejectWaiter("Fresh authenticated subscription failed. Acceptance is not established.");
      }
    }
    const attempt = activeAttempt.current;
    if (attempt && !waiter.current && !isCurrent(attempt)) {
      // Ordinary renewals/revocation interrupt an active sequence. Expected
      // resubscriptions above never send a command while connecting.
      generation.current++;
      if (record.current) {
        record.current.verdict = "INCONCLUSIVE";
        record.current.detail = "Live authorized scope changed; remaining commands were not sent.";
        paint();
      }
    }
  }, [revision, state.connection, state.session, state.snapshot, state.error]);

  const freshSnapshot = (attempt: ActiveAttempt) => new Promise<IncidentSnapshot>((resolve, reject) => {
    if (!isCurrent(attempt)) { reject(new Error("Live commander scope is required before refreshing state.")); return; }
    const desiredRevision = ++nextRevision.current;
    const timer = setTimeout(() => rejectWaiter("Fresh subscription did not settle in time. Inspect server state; no acceptance pass was recorded."), 25000);
    waiter.current = { revision: desiredRevision, seenReset: false, priorSession: current.current.state.session, timer, attempt, resolve, reject };
    setRevision(desiredRevision);
  });

  async function run(mode: AcceptanceMode) {
    const latest = current.current;
    if (activeAttempt.current || latest.state.pending || !latest.client || latest.state.connection !== "live" || !acceptanceAccess(latest.state.snapshot, latest.state.session, incidentId)) return;
    if (mode === "approved" && capturedExecution.current) return;
    const actorId = latest.state.session!.user.id;
    const attempt: ActiveAttempt = { generation: generation.current, actorId, client: latest.client };
    activeAttempt.current = attempt;
    setBusy(true); setNotice("Refreshing the baseline through the normal authenticated subscription…");
    const proposalId = mode === "terminal" ? terminalId : approvedId;
    try {
      const baseline = await freshSnapshot(attempt);
      if (!isCurrent(attempt)) throw new Error("Authorized scope changed before any command was sent.");
      const created = createExecutionAcceptance(mode, baseline, proposalId, actorId, () => crypto.randomUUID(), mode === "approved" ? controlId || undefined : undefined);
      record.current = created;
      setNotice(""); paint();
      await runExecutionAcceptance(created, {
        isCurrent: () => isCurrent(attempt),
        freshSnapshot: () => freshSnapshot(attempt),
        updated: () => {
          if (created.validExecutionAttempted) capturedExecution.current ??= created.steps.find(step => step.kind === "execute")!.command;
          paint();
        },
        send: async command => {
          if (!isCurrent(attempt)) throw new Error("Command was not sent because live access changed.");
          let receipt: ExecutionReceipt | undefined;
          await current.current.state.command(async () => {
            if (!isCurrent(attempt)) throw new Error("Command was not sent because live access changed.");
            if ("decision" in command) {
              const scoped = current.current.state.snapshot!;
              const control = scoped.proposals.find(p => p.id === command.proposalId && p.incidentId === incidentId);
              if (scoped.incident.scenarioVersion <= command.expectedVersion || !control || control.status !== "PENDING_APPROVAL" || control.version !== command.proposalVersion || control.requestedBy === attempt.actorId) throw new Error("Stale approval control changed or scenario advance is unconfirmed. Request was not sent.");
            }
            receipt = "decision" in command ? await attempt.client.approveAction(command) : await attempt.client.executeSimulation(command);
            return receipt;
          });
          if (!receipt) throw new Error("No confirmed receipt. Inspect subscribed state before retrying.");
          return receipt;
        },
      });
    } catch (error) {
      if (mounted.current && generation.current === attempt.generation) setNotice(error instanceof Error ? error.message : "Acceptance outcome is unconfirmed.");
    } finally {
      if (activeAttempt.current === attempt) {
        activeAttempt.current = null;
        if (mounted.current) { setBusy(false); paint(); }
      }
    }
  }

  const snapshot = state.snapshot;
  const access = acceptanceAccess(snapshot, state.session, incidentId);
  const disabled = busy || state.pending || state.connection !== "live" || !access;
  const terminalProposals = snapshot?.proposals.filter(p => p.incidentId === incidentId && isVerifiedProposal(p)) ?? [];
  const approvedProposals = snapshot?.proposals.filter(p => eligibleApprovedProposal(snapshot, p)) ?? [];
  const controls = snapshot?.proposals.filter(p => eligibleStaleApprovalControl(snapshot, p, state.session?.user.id ?? "", approvedId)) ?? [];
  const result = record.current;
  const receiptError = result?.steps.map(step => step.receipt).find(r => r && !r.ok && r.error.code === "UNAUTHENTICATED");
  const proposalLabel = (id: string) => {
    const proposal = snapshot?.proposals.find(p => p.id === id);
    return proposal ? `${proposal.action.type.replaceAll("_", " ")} · ${proposal.status} · ${id.slice(0, 12)}…` : id;
  };
  return <main className="connected-main">
    <a className="text-button" href={`/incidents/${encodeURIComponent(incidentId)}`}>← Return to incident review</a>
    <ConnectionStatus state={state.connection} />
    <h1>Browser execution acceptance</h1>
    <p>Separate operator acceptance page. Uses this human session and the normal incident client. Results describe the captured subscription observations.</p>
    {state.error && <p className="impact-warning" role="alert">{state.error}</p>}
    <AuthenticationRecovery error={state.authenticationError} />
    {!snapshot || !state.session ? <p role="status">Waiting for an authenticated scoped incident subscription.</p> : !access ? <p className="impact-warning">An active human commander with EXECUTE_SIMULATION permission on a synthetic incident is required.</p> : <>
      <IncidentHeading incident={snapshot.incident} />
      <p className="small">Server scenario v{snapshot.incident.scenarioVersion} · {snapshot.proposals.length} proposals · {snapshot.approvals.length} approvals · {snapshot.verifications.length} verifications</p>
      <section className="panel decision-body">
        <h2>Terminal duplicate rejection</h2>
        <p>Send one new-key execution request for an existing verified proposal. Require INVALID_TRANSITION and unchanged state after a fresh subscription. Stale-version and stale-approval gates are NOT TESTED in this mode.</p>
        <label className="field-label">Existing verified proposal<select value={terminalId} disabled={disabled} onChange={e => setTerminalId(e.target.value)}>
          <option value="">Select a verified proposal</option>
          {terminalProposals.map(p => <option key={p.id} value={p.id}>{proposalLabel(p.id)}</option>)}
        </select></label>
        <Button type="button" variant="outline" disabled={disabled || !terminalProposals.some(p => p.id === terminalId)} onClick={() => void run("terminal")}>Test terminal duplicate rejection</Button>
      </section>
      <section className="panel decision-body">
        <h2>Approved execution and exact replay</h2>
        <p>This mode executes an already human-approved synthetic response. It first rejects a stale execution request, then sends one valid execution, repeats its exact key/payload and rejects a new-key terminal duplicate.</p>
        <label className="field-label">Already approved current-version proposal<select value={approvedId} disabled={disabled || Boolean(capturedExecution.current)} onChange={e => { setApprovedId(e.target.value); setControlId(""); }}>
          <option value="">Select an approved proposal</option>
          {approvedProposals.map(p => <option key={p.id} value={p.id}>{proposalLabel(p.id)}</option>)}
        </select></label>
        <label className="field-label">Separate stale approval control (optional)<select value={controlId} disabled={disabled || !approvedId || Boolean(capturedExecution.current)} onChange={e => setControlId(e.target.value)}>
          <option value="">Not selected · stale approval NOT TESTED</option>
          {controls.map(p => <option key={p.id} value={p.id}>{proposalLabel(p.id)}</option>)}
        </select></label>
        <p className="small">A selected control must be someone else’s pending proposal from the same scenario. Only after execution advances the version, send its deliberately stale approval request and require VERSION_CONFLICT, unchanged proposal/approval counts and unchanged state.</p>
        <Button type="button" disabled={disabled || Boolean(capturedExecution.current) || !approvedProposals.some(p => p.id === approvedId) || snapshot.incident.scenarioVersion < 2 || Boolean(controlId && !controls.some(p => p.id === controlId))} onClick={() => void run("approved")}>Execute approved synthetic response and test exact replay</Button>
        {capturedExecution.current && <p className="impact-warning">A positive execution attempt is reserved on this page. Its exact metadata remains in memory; another new-key positive attempt is disabled. Inspect server state if any result is unconfirmed.</p>}
      </section>
      {notice && <p role="status">{notice}</p>}
      {result && <section className="panel decision-body" aria-label="Captured acceptance results">
        <h2>Captured acceptance result · {result.verdict}</h2>
        <p role="status">{result.detail}</p>
        <p className="small">Baseline scenario v{result.baseline.scenarioVersion} · proposal <code>{result.proposalId}</code></p>
        {result.steps.map((step, index) => <article className="decision-body" key={index}>
          <h3>{index + 1}. {step.label} · {step.verdict}</h3>
          <p>{step.detail}</p>
          {step.receipt && <p>{step.receipt.ok ? <>Server receipt: verification <code>{step.receipt.data.id}</code> · audit <code>{step.receipt.auditEventId ?? "Not supplied"}</code></> : <>Server error: {step.receipt.error.code} · {step.receipt.error.message} · retryable {String(step.receipt.error.retryable)}</>} · correlation <code>{step.receipt.correlationId}</code></p>}
          {step.after && <p className="small">Fresh subscribed scenario v{step.after.scenarioVersion} · {step.after.proposals.length} proposals · {step.after.approvals.length} approvals · {step.after.verifications.length} verifications</p>}
          <details className="small decision-provenance"><summary>Exact nonsecret command metadata</summary><code>{JSON.stringify(step.command)}</code></details>
        </article>)}
        <AuthenticationRecovery error={receiptError && !receiptError.ok ? receiptError.error : null} />
      </section>}
    </>}
  </main>;
}
