"use client";
import { useEffect, useRef, useState } from "react";
import type { IncidentSnapshot, SetIncidentRetentionPolicyCommand } from "@/lib/contracts";
import type { IncidentClient } from "@/hooks/use-incident";
import { canEditRetention, retentionDraft, validRetentionDraft, type RetentionDraft } from "@/hooks/retention-presentation";
import type { RunCommand } from "./incident-operations";
import { Button } from "./ui/button";

export function IncidentRetention({ snapshot, userId, client, disabled, command }: {
  snapshot: IncidentSnapshot; userId?: string; client: IncidentClient; disabled: boolean; command: RunCommand;
}) {
  const policy = snapshot.retentionPolicy;
  const editable = canEditRetention(snapshot, userId);
  const [draft, setDraft] = useState<RetentionDraft | null>(null);
  const [reason, setReason] = useState("");
  const [attempt, setAttempt] = useState<SetIncidentRetentionPolicyCommand | null>(null);
  const [phase, setPhase] = useState<"accepted" | "unknown" | null>(null);
  const current = useRef({ policy, editable }); current.current = { policy, editable };
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => {
    if (!editable) { generation.current++; setDraft(null); setReason(""); setAttempt(null); setPhase(null); }
    else if (attempt && policy && policy.version !== attempt.expectedVersion) { setDraft(null); setReason(""); setAttempt(null); setPhase(null); }
  }, [editable, policy, attempt]);
  async function submit(payload: SetIncidentRetentionPolicyCommand) {
    const started = generation.current;
    setAttempt(payload); setPhase("unknown");
    let invoked = false;
    await command(async () => {
      invoked = true;
      const result = await client.setIncidentRetentionPolicy(payload);
      if (started === generation.current && current.current.editable && current.current.policy?.version === payload.expectedVersion) {
        if (result.ok) setPhase("accepted");
        else { setAttempt(null); setPhase(null); }
      }
      return result;
    });
    if (!invoked && started === generation.current) { setAttempt(null); setPhase(null); }
  }
  const stale = !!draft && !!policy && draft.version !== policy.version;
  return <details className="panel decision-body incident-retention">
    <summary>Incident preservation settings</summary>
    <p className="small">Incidents are preserved indefinitely by default. A hold requires preservation regardless of the minimum period. These settings record preservation intent; BreachBay has no automatic deletion or purge operation.</p>
    {!policy ? <p className="small" role="status">Preservation policy is unavailable in this subscription. Changes require a server-confirmed policy revision.</p> : <>
      <dl className="record-details"><dt>Current preservation</dt><dd>{policy.indefinite ? "Indefinite" : `Minimum ${policy.minimumRetentionDays} days`}</dd><dt>Preservation hold</dt><dd>{policy.hold ? "On" : "Off"}</dd><dt>Minimum period</dt><dd>{policy.minimumRetentionDays} days{policy.indefinite ? " · retained for use if indefinite preservation is turned off" : ""}</dd><dt>Policy revision</dt><dd>{policy.version}{policy.version === 0 ? " · conservative legacy default" : ""}</dd>{policy.updatedAt && <><dt>Recorded update</dt><dd><time dateTime={policy.updatedAt}>{policy.updatedAt}</time></dd></>}{policy.updatedBy && <><dt>Updating actor</dt><dd>{policy.updatedBy}</dd></>}</dl>
      {!editable ? <p className="small muted">Only an active human commander assigned to this incident can change preservation settings.</p> : !draft ? <Button type="button" variant="outline" disabled={disabled} onClick={() => { setDraft(retentionDraft(policy)); setReason(""); }}>Edit preservation settings</Button> : <form onSubmit={event => {
        event.preventDefault();
        if (disabled || attempt || !editable || !validRetentionDraft(draft, policy, reason)) return;
        void submit({ incidentId: snapshot.incident.id, indefinite: draft.indefinite, minimumRetentionDays: Number(draft.days), hold: draft.hold, expectedVersion: draft.version, reason: reason.trim(), idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() });
      }}>
        {stale && <p className="impact-warning" role="status">The policy changed on the server. Reload the current policy before editing.</p>}
        <fieldset disabled={disabled || stale || !!attempt}>
          <label className="workflow-row"><input type="checkbox" checked={draft.indefinite} onChange={event => setDraft({ ...draft, indefinite: event.target.checked })} />Preserve indefinitely</label>
          <label className="field-label">Minimum preservation period (days)<input type="number" min="1" max="3650" step="1" required value={draft.days} onChange={event => setDraft({ ...draft, days: event.target.value })} /></label>
          <p className="small">1–3650 days. This is a minimum preservation setting, not a deletion schedule. Indefinite preservation and an active hold take precedence.</p>
          <label className="workflow-row"><input type="checkbox" checked={draft.hold} onChange={event => setDraft({ ...draft, hold: event.target.checked })} />Place preservation hold</label>
          <label className="field-label">Audited change reason<textarea required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
        </fieldset>
        <p className="small muted">Saving requires a recent human authentication factor. The server checks policy revision {draft.version}; incident and scenario revisions are separate.</p>
        <div className="button-row">
          <Button disabled={disabled || !!attempt || stale || !validRetentionDraft(draft, policy, reason)}>Submit preservation settings</Button>
          {!attempt && <Button type="button" variant="outline" disabled={disabled} onClick={() => { setDraft(stale ? retentionDraft(policy) : null); setReason(""); }}>{stale ? "Reload current policy" : "Cancel editing"}</Button>}
          {attempt && phase === "unknown" && <Button type="button" variant="outline" disabled={disabled || stale} onClick={() => void submit(attempt)}>Retry the same preservation request</Button>}
        </div>
      </form>}
      {attempt && <p className="small" role="status">{phase === "accepted" ? "Server accepted the request. Waiting for subscribed policy state." : "Request outcome is unconfirmed. Inspect the current policy before retrying; the same request key and settings will be reused."}</p>}
    </>}
  </details>;
}
