"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { motion } from "motion/react";
import type { IncidentSnapshot } from "@/lib/contracts";
import type { IncidentClient } from "@/hooks/use-incident";
import { useInterfaceMotion } from "@/hooks/use-interface-motion";
import { incidentObjectLabel } from "@/hooks/audit-presentation";
import { displayLabel } from "./ui/labels";
import { Button } from "./ui/button";
import { EvidenceCitations, ResponseTargets } from "./decision-details";
import { ResponsePlanning } from "./response-planning";
import { ProtectedDownloadControl } from "./evidence-transfers";
import type { ResponsePreview } from "@/lib/response/contract";
import { RecordedApplicationEffect } from "./recorded-application-effect";

/** Native modal behavior makes the background inert and provides keyboard focus containment. */
export function DetailDialog({ title, objectId, onDismiss, children }: { title: string; objectId: string; onDismiss: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const uiMotion = useInterfaceMotion();
  useEffect(() => {
    const panel = dialog.current;
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel?.showModal();
    return () => { panel?.close(); if (origin?.isConnected) origin.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => { close.current?.focus({ preventScroll: true }); if (dialog.current) dialog.current.scrollTop = 0; }, [objectId]);
  return <motion.dialog ref={dialog} className="detail-panel incident-detail-dialog" aria-labelledby={titleId} aria-modal="true"
    onCancel={event => { event.preventDefault(); onDismiss(); }}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const targets = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])')].filter(element => element.getClientRects().length > 0);
      const first = targets[0], last = targets.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}
    initial={uiMotion.instant ? false : { opacity: 0, transform: "translateX(24px)" }} animate={{ opacity: 1, transform: "translateX(0px)" }}
    exit={{ opacity: 0, transform: uiMotion.instant ? "translateX(0px)" : "translateX(24px)" }} transition={{ duration: uiMotion.duration, ease: [0.32, 0.72, 0, 1] }}>
    <Button ref={close} autoFocus type="button" variant="outline" onClick={onDismiss}>Close details</Button>
    <h2 id={titleId}>{title}</h2>{children}
  </motion.dialog>;
}

export function IncidentDetails({ snapshot: s, selected, client, downloadDisabled, onInspect, onDismiss }: {
  snapshot: IncidentSnapshot; selected: string; client?: IncidentClient; downloadDisabled: boolean; onInspect: (id: string) => void; onDismiss: () => void;
}) {
  const evidence = s.evidence.find(e => e.id === selected);
  const asset = s.assets.find(a => a.id === selected);
  const indicator = s.indicators.find(i => i.id === selected);
  const edge = s.edges.find(e => e.id === selected);
  const finding = s.findings.find(f => f.id === selected);
  const proposal = s.proposals.find(p => p.id === selected);
  const applicationTarget = s.operationalTargets?.find(t => t.id === selected);
  const applicationResponse = s.operationalResponses?.find(r => r.id === selected);
  const applicationPreview = applicationResponse ? JSON.parse(applicationResponse.previewJson) as ResponsePreview : null;
  const run = s.investigations.find(r => r.id === selected);
  const task = s.tasks.find(t => t.id === selected);
  const approval = s.approvals.find(a => a.id === selected);
  const verification = s.verifications.find(v => v.id === selected);
  const simulation = s.simulations.find(b => b.id === selected);
  const review = s.graphReviews?.find(r => r.id === selected);
  const report = s.reports.find(r => r.id === selected);
  const policy = s.retentionPolicy?.id === selected ? s.retentionPolicy : undefined;
  const title = evidence?.title ?? asset?.name ?? finding?.title ?? (indicator ? `${indicator.kind} · ${indicator.normalizedValue}` : incidentObjectLabel(s, selected)) ?? "Referenced object unavailable";
  const citations = (ids: string[]) => <EvidenceCitations ids={ids} evidence={s.evidence} onInspect={onInspect} />;
  const link = (id: string) => {
    const label = incidentObjectLabel(s, id);
    return label ? <Button type="button" variant="ghost" onClick={() => onInspect(id)}>{label}</Button> : <p className="small">Referenced record unavailable · <code>{id}</code></p>;
  };
  const name = (id: string) => s.assets.find(a => a.id === id)?.name ?? s.evidence.find(e => e.id === id)?.title ?? s.indicators.find(i => i.id === id)?.normalizedValue ?? "Endpoint unavailable";
  return <DetailDialog title={title} objectId={selected} onDismiss={onDismiss}>
    <details className="small"><summary>Canonical object ID</summary><p><code>{selected}</code></p></details>
    {evidence && <>
      <p>{evidence.source} · {evidence.classification} · {evidence.kind}</p>
      <p>Captured <time dateTime={evidence.capturedAt}>{evidence.capturedAt}</time> · attached <time dateTime={evidence.createdAt}>{evidence.createdAt}</time></p>
      {client && <ProtectedDownloadControl key={evidence.id} client={client} incidentId={s.incident.id} evidenceId={evidence.id} disabled={downloadDisabled} />}
      <pre className="evidence-content">{evidence.redactedContent}</pre>
      <details className="bb-evidence-integrity"><summary>Evidence integrity & model approval</summary><dl className="record-details"><dt>Evidence version</dt><dd>{evidence.version}</dd><dt>Original SHA-256</dt><dd>{evidence.sha256}</dd><dt>Derivative SHA-256</dt><dd>{evidence.redactedSha256}</dd><dt>Approved for model use</dt><dd>{evidence.modelApproved ? "Yes" : "No"}</dd></dl></details>
      {!!evidence.assetIds.length && <><h3>Linked assets</h3>{evidence.assetIds.map(id => <div key={id}>{link(id)}</div>)}</>}
    </>}
    {asset && <dl className="record-details">
      <dt>Type</dt><dd>{displayLabel(asset.type)}</dd><dt>Server-recorded status</dt><dd>{displayLabel(asset.state)}</dd>
      <dt>Owner</dt><dd>{asset.owner || "Owner not recorded"}</dd><dt>Criticality</dt><dd>{asset.riskLabels.includes("CRITICALITY_UNREVIEWED") ? "Unreviewed" : displayLabel(asset.criticality)}</dd>
      <dt>Last seen</dt><dd><time dateTime={asset.lastSeen}>{asset.lastSeen}</time></dd>
      <dt>Risk labels</dt><dd>{asset.riskLabels.length ? asset.riskLabels.join(", ") : "No risk labels recorded"}</dd><dt>Asset version</dt><dd>{asset.version}</dd>
    </dl>}
    {indicator && <><dl className="record-details"><dt>Indicator type</dt><dd>{indicator.kind}</dd><dt>Normalized value</dt><dd>{indicator.normalizedValue}</dd><dt>Confidence</dt><dd>{indicator.confidence}</dd></dl>{citations(indicator.evidenceIds)}</>}
    {applicationTarget && <>
      <p>{applicationTarget.active ? "In response scope" : "Removed from response scope"}</p>
      <dl className="record-details"><dt>Responsible team</dt><dd>{applicationTarget.owner}</dd><dt>Business importance</dt><dd>{displayLabel(applicationTarget.criticality)}</dd><dt>Reviewed</dt><dd>{applicationTarget.reviewedAt}</dd></dl>
      {link(applicationTarget.assetId)}<p className="small">Scope review does not establish the host's health or compromise.</p>
    </>}
    {applicationResponse && applicationPreview && <>
      <p>{displayLabel(applicationResponse.status)}</p><p>{applicationResponse.rationale}</p>
      <h3>Reviewed effect</h3><p>{applicationPreview.impact}</p><p className="small">{applicationPreview.limitation}</p>
      {link(applicationResponse.targetId)}{citations(applicationResponse.evidenceIds)}
      {applicationResponse.approvalReason && <p>Human decision: {applicationResponse.approvalReason}</p>}
      <RecordedApplicationEffect response={applicationResponse} />
      <p className="small">This is the recorded result. Current execution controls are in Application response.</p>
    </>}
    {finding && <><p>{finding.summary}</p><p>{finding.confidence} confidence · {finding.verificationStatus}</p>{citations(finding.evidenceIds)}{finding.unknowns.map((text, i) => <p key={i}>Unresolved: {text}</p>)}{finding.recommendedNextQueries?.map((text, i) => <p key={i}>Recommended query: {text}</p>)}</>}
    {proposal && <><p>{proposal.status} · scenario v{proposal.expectedVersion} · proposal v{proposal.version}</p><p>{proposal.rationale}</p><ResponseTargets action={proposal.action} incidentId={s.incident.id} assets={s.assets} edges={s.edges} />{citations(proposal.evidenceIds)}{proposal.assumptions.map((text, i) => <p key={i}>Assumption: {text}</p>)}{proposal.uncertainty.map((text, i) => <p key={i}>Uncertainty: {text}</p>)}<ResponsePlanning plan={proposal.planning} assets={s.assets} edges={s.edges} incidentId={s.incident.id} version={proposal.expectedVersion} /><p className="small">Decisions and execution remain in Response decisions, with their current server-side guards.</p></>}
    {run && <><p>{run.objective}</p><p>{run.status} · {run.provider ?? "Provider unconfirmed"} / {run.model ?? "Model unconfirmed"}</p><p>Updated {run.updatedAt}</p>{s.findings.filter(f => f.investigationId === run.id).map(f => <div key={f.id}>{link(f.id)}</div>)}{s.proposals.filter(p => p.investigationId === run.id).map(p => <div key={p.id}>{link(p.id)}</div>)}</>}
    {task && <><p>{task.state} · task v{task.version}</p><p>Assignee: {task.assigneeId ?? "Unassigned"}</p><p>Created {task.createdAt}</p>{task.dueAt && <p>Due {task.dueAt}</p>}</>}
    {approval && <><p>{approval.decision} · {approval.justification}</p><p>Approving actor: {approval.approverId}</p><p>Recorded {approval.createdAt} · expires {approval.expiresAt}</p><p>Scenario v{approval.scenarioVersion} · proposal v{approval.proposalVersion}</p>{link(approval.proposalId)}<p className="small">Historical approval does not establish current execution permission.</p></>}
    {verification && <><p>{verification.status}: {verification.summary}</p><p>Expected v{verification.expectedVersion} · observed v{verification.observedVersion} · {verification.createdAt}</p>{link(verification.proposalId)}</>}
    {simulation && <><p>Parent scenario v{simulation.parentVersion} · {simulation.createdAt}</p><p>Predicted containment: {Math.round(simulation.diff.containmentCoverage * 100)}%</p><p>Deterministic synthetic preview; consult the separate execution verification.</p>{link(simulation.proposalId)}</>}
    {review && <><p>{review.decision} · {review.createdAt}</p><p>Reviewing actor: {review.reviewedBy}</p>{link(review.edgeId)}{review.findingId && link(review.findingId)}</>}
    {report && <><p>Report version {report.version} · created {report.createdAt}</p><p>Exporting actor: {report.createdBy}</p><p>Use the protected incident report export to inspect the server-generated report.</p></>}
    {policy && <><p>Policy revision {policy.version} · {policy.indefinite ? "Indefinite preservation" : `Minimum ${policy.minimumRetentionDays} days`}</p><p>Preservation hold: {policy.hold ? "On" : "Off"}. No automatic deletion is implemented.</p>{policy.updatedAt && <p>Updated {policy.updatedAt}</p>}</>}
    {selected === s.incident.id && <><p>{s.incident.description}</p><p>{s.incident.severity} · {s.incident.status} · {s.incident.classification}</p><p>Incident v{s.incident.version} · scenario v{s.incident.scenarioVersion}</p></>}
    {(edge || asset || evidence || indicator || proposal) && <>
      <h3>Recorded relationships</h3>
      {!s.edges.some(e => e.id === selected || e.fromId === selected || e.toId === selected) && <p className="small muted">No relationships recorded for this object.</p>}
      {s.edges.filter(e => e.id === selected || e.fromId === selected || e.toId === selected).map(e => <article className="detail-relationship" key={e.id}>
        <h4>{name(e.fromId)} → {name(e.toId)}</h4><p>{e.type} · {e.verificationStatus} · {e.confidence} confidence{s.incident.scenarioId === "evidence-driven" ? " · Recorded relationship; current reachability unproven" : e.enabled ? " · Enabled" : " · Disabled"}</p>{citations(e.sourceEvidenceIds)}
        <details className="small"><summary>Relationship provenance</summary><p>Relationship {e.id}</p><p>Source {e.fromId} · target {e.toId}</p><p>Asserted by {e.assertedBy} · {e.createdAt}</p></details>
      </article>)}
    </>}
  </DetailDialog>;
}
