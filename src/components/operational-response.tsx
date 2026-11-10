"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { AuthenticationRecovery } from "./auth/authentication-recovery";
import type { IncidentClient } from "@/hooks/use-incident";
import type { CommandError, CommandResult, IncidentSnapshot } from "@/lib/contracts";
import type { ResponsePreview } from "@/lib/response/contract";
import { previewIsFresh, responseAvailability, retryableCommandMeta, targetMatchesPreview } from "@/hooks/operational-response-state";
import { newestApplicationResponses } from "@/hooks/application-effect-presentation";
import { RecordedApplicationEffect } from "./recorded-application-effect";
import { BrandArtwork } from "./brand-artwork";

type Preview = { name: string; preview: ResponsePreview; proofJson: string; signature: string };
const labels: Record<string, string> = {
  PENDING_APPROVAL: "Awaiting human review", APPROVED: "Approved", REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn", EXECUTING: "Awaiting verification", UNCONFIRMED: "Outcome unconfirmed",
  VERIFIED_SUCCESS: "Application effect verified", VERIFIED_FAILED: "Application rejected the response",
};

export function OperationalResponses({ snapshot: s, client, userId, disabled }: {
  snapshot: IncidentSnapshot; client: IncidentClient; userId?: string; disabled: boolean;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<CommandError | null>(null);
  const [owner, setOwner] = useState(""), [criticality, setCriticality] = useState("");
  const [reason, setReason] = useState(""), [rationale, setRationale] = useState("");
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [withdrawals, setWithdrawals] = useState<Record<string, string>>({});
  const [retirements, setRetirements] = useState<Record<string, string>>({});
  const [renew, setRenew] = useState(false);
  const [now, setNow] = useState(Date.now);
  const commandMeta = useRef(retryableCommandMeta());
  const capabilities = s.memberships.find(m => m.userId === userId && m.active)?.capabilities ?? [];
  const targets = s.operationalTargets ?? [], responses = s.operationalResponses ?? [];
  const target = targets.find(t => t.connectorId === preview?.preview.connectorId);
  const reviewed = !!preview && targetMatchesPreview(target, preview.preview);
  const fresh = !!preview && previewIsFresh(preview.preview, now);
  const commander = capabilities.includes("MANAGE_INCIDENT"), unavailable = disabled || busy;

  // Expiration changes the controls even when the database sends no further updates.
  const deadlines = [preview ? Date.parse(preview.preview.observation.observedAt) + 120001 : NaN,
    ...responses.filter(r => r.status === "APPROVED").map(r => Date.parse(r.approvalExpiresAt ?? ""))].join(",");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    function update() {
      const current = Date.now();
      setNow(current);
      const future = deadlines.split(",").map(Number).filter(t => Number.isFinite(t) && t > current);
      if (future.length) timer = setTimeout(update, Math.min(...future) - current + 1);
    }
    update();
    return () => clearTimeout(timer);
  }, [deadlines]);

  function command<T extends object>(action: string, args: T) {
    return { ...commandMeta.current(action, args), ...args };
  }
  async function run<T>(call: () => Promise<CommandResult<T>>) {
    setBusy(true); setError(null);
    try {
      const result = await call();
      if (!result.ok) setError(result.error);
      return result;
    } catch {
      setError({ code: "DEPENDENCY_UNAVAILABLE", retryable: true, message: "The server did not confirm the outcome. Check the recorded state before retrying." });
    } finally { setBusy(false); }
  }
  async function readPreview() {
    return run(async () => {
      const result = await client.readOperationalPreview!(s.incident.id);
      if (result.ok) {
        const existing = targets.find(t => t.connectorId === result.data.preview.connectorId);
        setPreview(result.data); setEvidenceIds([]); setRenew(false);
        setOwner(existing?.owner ?? ""); setCriticality(existing?.criticality ?? ""); setReason("");
      }
      return result;
    });
  }

  return <div className="bb-real-responses">
    <div className="bb-section-heading"><h2>Application response</h2><p>Review a connected application, decide together, and verify the real effect.</p></div>
    {targets.length > 0 && <section className="panel bb-real-plan" aria-label="Response scope">
      <h3>Reviewed applications</h3>
      {targets.map(t => <div key={t.id} className="bb-real-target">
        <div className="panel-title"><strong>{t.name}</strong><span className="state-chip">{t.active ? "In response scope" : "Removed from scope"}</span></div>
        <p className="small muted">{t.owner} · {t.criticality.toLowerCase()} business importance</p>
        {t.active && commander && <details><summary>Remove from response scope</summary>
          <p>Stops further dispatch through this target. An action already sent to the application may still finish; its outcome can still be checked.</p>
          <label className="field-label">Reason for removing this application<textarea maxLength={1000} value={retirements[t.id] ?? ""} onChange={e => setRetirements(v => ({ ...v, [t.id]: e.target.value }))} /></label>
          <Button variant="outline" disabled={unavailable || !client.retireOperationalTarget || !retirements[t.id]?.trim()} onClick={() => void run(() => client.retireOperationalTarget!(command(`retire:${t.id}`, { incidentId: s.incident.id, targetId: t.id, expectedVersion: t.version, reason: retirements[t.id] })))}>Remove application</Button>
        </details>}
      </div>)}
    </section>}
    <section className="panel bb-real-plan"><h3>Prepare a response</h3><p>Upload the application's logs first. A commander reviews its scope and business importance before it becomes a response target.</p>
      <Button variant="outline" disabled={unavailable || !capabilities.includes("PROPOSE") || !client.readOperationalPreview} onClick={() => void readPreview()}>{preview ? "Refresh application preview" : "Read connected application"}</Button>
      {preview && <>
        <div className="bb-real-observation"><strong>{preview.preview.observation.loginEnabled ? "Login enabled" : "Login disabled"}</strong><time dateTime={preview.preview.observation.observedAt}>Observed {new Date(preview.preview.observation.observedAt).toLocaleTimeString()}</time></div>
        <p>{preview.preview.impact}</p><details><summary>Connection scope</summary><p>{preview.preview.limitation}</p></details>
        {!fresh && <p role="status">This observation expired. Refresh the application preview before continuing.</p>}
        {target?.active && !reviewed && <p role="status">The application instance changed. A commander must review this connection again.</p>}
        {reviewed && commander && !renew && <Button variant="ghost" disabled={unavailable} onClick={() => setRenew(true)}>Review target scope again</Button>}
        {(!reviewed || renew) && commander && <form onSubmit={e => {
          e.preventDefault();
          void run(async () => {
            const result = await client.registerOperationalTarget!(command("register", {
              incidentId: s.incident.id, name: preview.name, owner, criticality, reason,
              expectedVersion: target?.version ?? 0, proofJson: preview.proofJson, signature: preview.signature,
            }));
            if (result.ok) setRenew(false);
            return result;
          });
        }}>
          <h4>{target ? "Renew target scope review" : "Review target scope"}</h4>
          <div className="bb-real-fields"><label className="field-label">Responsible team<input required maxLength={100} value={owner} onChange={e => setOwner(e.target.value)} /></label>
            <label className="field-label">Business importance<select required value={criticality} onChange={e => setCriticality(e.target.value)}><option value="">Choose importance</option>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(c => <option key={c}>{c}</option>)}</select></label></div>
          <label className="field-label">Reason for including this application<textarea required maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label>
          {target && <p>Renewing this review invalidates proposals bound to its previous scope.</p>}
          <Button disabled={unavailable || !fresh || !client.registerOperationalTarget || !owner.trim() || !reason.trim() || !criticality}>Confirm target scope</Button>
        </form>}
        {!reviewed && !commander && <p>A commander must review this application before you can propose a response.</p>}
        {reviewed && target && !renew && <form onSubmit={e => {
          e.preventDefault();
          void run(async () => {
            const result = await client.proposeOperationalResponse!(command("propose", {
              incidentId: s.incident.id, targetId: target.id,
              operation: preview.preview.observation.loginEnabled ? "DISABLE_APPLICATION_LOGIN" as const : "ENABLE_APPLICATION_LOGIN" as const,
              expectedTargetVersion: target.version, proofJson: preview.proofJson, signature: preview.signature, evidenceIds, rationale,
            }));
            if (result.ok) { setPreview(null); setRationale(""); }
            return result;
          });
        }}>
          <h4>{preview.preview.observation.loginEnabled ? "Disable application access" : "Restore application login"}</h4>
          <fieldset disabled={unavailable}><legend>Source evidence for this decision</legend>{s.evidence.filter(e => e.classification !== "SYNTHETIC" && e.assetIds.includes(target.assetId)).map(e => <label className="bb-real-check" key={e.id}><input type="checkbox" checked={evidenceIds.includes(e.id)} onChange={event => setEvidenceIds(ids => event.target.checked ? [...ids, e.id] : ids.filter(id => id !== e.id))} />{e.title}</label>)}</fieldset>
          <label className="field-label">Why this response is appropriate<textarea required maxLength={1500} value={rationale} onChange={e => setRationale(e.target.value)} /></label>
          <Button disabled={unavailable || !fresh || !client.proposeOperationalResponse || !rationale.trim() || !evidenceIds.length}>Request separate human approval</Button>
        </form>}
      </>}
    </section>
    {busy && <p role="status">Waiting for the server to confirm this step…</p>}
    {error && <p role="alert" className="impact-warning">{error.message}</p>}
    <AuthenticationRecovery error={error} />
    {!responses.length && <div className="bb-artwork-empty"><BrandArtwork name="human-review" sizes="136px" /><div><h3>No responses proposed</h3><p>Start with source evidence and a reviewed application. A separate person approves each response before execution.</p></div></div>}
    {newestApplicationResponses(responses).map(r => {
      const t = targets.find(t => t.id === r.targetId);
      const p = JSON.parse(r.previewJson) as ResponsePreview;
      const { expired, targetChanged, withdrawable } = responseAvailability(r, t, now);
      const completed = ["VERIFIED_SUCCESS", "VERIFIED_FAILED", "REJECTED", "WITHDRAWN"].includes(r.status);
      return <article className="panel bb-real-card" key={r.id}>
        <div className="panel-title"><h3>{r.operation === "DISABLE_APPLICATION_LOGIN" ? "Disable application access" : "Restore application login"}</h3><span className="state-chip" data-status={r.status}>{labels[r.status] ?? r.status}</span></div>
        <p className="small muted">{t?.name} · {t?.owner}</p>
        <RecordedApplicationEffect response={r} />
        {completed ? <details className="bb-recorded-reason"><summary>Proposal and human decision</summary><p>{r.rationale}</p>{r.approvalReason && <p><strong>Human review:</strong> {r.approvalReason}</p>}</details> : <><p>{r.rationale}</p>{r.approvalReason && <p><strong>Human review:</strong> {r.approvalReason}</p>}</>}
        <details><summary>Reviewed impact and evidence</summary><p>{p.impact}</p><p>{p.limitation}</p><ul>{r.evidenceIds.map(id => <li key={id}>{s.evidence.find(e => e.id === id)?.title ?? "Evidence unavailable"}</li>)}</ul></details>
        {targetChanged && withdrawable && <p role="status">Target scope changed. Withdraw this response and prepare a new preview.</p>}
        {r.status === "PENDING_APPROVAL" && capabilities.includes("APPROVE") && <>
          {r.requestedBy === userId && <p>Your proposal requires another human commander to approve it.</p>}
          <label className="field-label">Decision reason<textarea maxLength={1500} value={decisions[r.id] ?? ""} onChange={e => setDecisions(v => ({ ...v, [r.id]: e.target.value }))} /></label>
          <div className="button-row">
            <Button disabled={unavailable || targetChanged || !client.approveOperationalResponse || r.requestedBy === userId || !decisions[r.id]?.trim()} onClick={() => void run(() => client.approveOperationalResponse!(command(`approve:${r.id}`, { incidentId: s.incident.id, responseId: r.id, expectedVersion: r.version, decision: "APPROVE" as const, reason: decisions[r.id] })))}>Approve response</Button>
            <Button variant="outline" disabled={unavailable || targetChanged || !client.approveOperationalResponse || !decisions[r.id]?.trim()} onClick={() => void run(() => client.approveOperationalResponse!(command(`reject:${r.id}`, { incidentId: s.incident.id, responseId: r.id, expectedVersion: r.version, decision: "REJECT" as const, reason: decisions[r.id] })))}>Reject</Button>
          </div>
        </>}
        {["APPROVED", "EXECUTING", "UNCONFIRMED"].includes(r.status) && capabilities.includes("EXECUTE_RESPONSE") && <Button disabled={unavailable || !client.executeOperationalResponse || (r.status === "APPROVED" && (expired || targetChanged))} onClick={() => void run(() => client.executeOperationalResponse!(command(`execute:${r.id}`, { incidentId: s.incident.id, responseId: r.id, expectedVersion: r.version })))}>{r.executionId ? "Check or resume execution" : "Execute approved response"}</Button>}
        {r.status === "APPROVED" && expired && <p role="status">Approval expired. Withdraw this response and prepare a fresh decision.</p>}
        {withdrawable && (r.requestedBy === userId || commander) && <details><summary>Withdraw this response</summary>
          <label className="field-label">Withdrawal reason<textarea maxLength={1500} value={withdrawals[r.id] ?? ""} onChange={e => setWithdrawals(v => ({ ...v, [r.id]: e.target.value }))} /></label>
          <Button variant="outline" disabled={unavailable || !client.withdrawOperationalResponse || !withdrawals[r.id]?.trim()} onClick={() => void run(() => client.withdrawOperationalResponse!(command(`withdraw:${r.id}`, { incidentId: s.incident.id, responseId: r.id, expectedVersion: r.version, reason: withdrawals[r.id] })))}>Withdraw response</Button>
        </details>}
      </article>;
    })}
  </div>;
}
