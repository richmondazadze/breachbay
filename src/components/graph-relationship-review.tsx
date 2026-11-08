"use client";
import { useEffect, useRef, useState } from "react";
import type { CommandError, GraphEdgeReview, GraphEdgeReviewPreparation, IncidentSnapshot } from "@/lib/contracts";
import type { IncidentClient } from "@/hooks/use-incident";
import { canVerifyGraphRelationship, parseGraphReviewPreparation, reviewableRelationshipTypes, reviewPreparationMatches, supportingReviewedFindings } from "@/hooks/graph-review";
import { AuthenticationRecovery } from "./auth/authentication-recovery";
import { EvidenceCitations } from "./decision-details";
import type { RunCommand } from "./incident-operations";
import { Button } from "./ui/button";

function RecordedReview({ review }: { review: GraphEdgeReview }) {
  let packet: GraphEdgeReviewPreparation | null = null;
  try {
    if (review.evidenceRefsJson.length <= 20000) packet = parseGraphReviewPreparation(JSON.stringify({ incidentId: review.incidentId, edgeId: review.edgeId, expectedEdgeDigest: review.expectedEdgeDigest, evidenceRefs: JSON.parse(review.evidenceRefsJson) }), review.incidentId, review.edgeId);
  } catch {}
  return <article className="decision-body">
    <p>{review.decision} · reviewer <code>{review.reviewedBy}</code> · <time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleString()}</time></p>
    <p className="small">Review {review.id}{review.findingId ? ` · finding reference ${review.findingId}` : ""}</p>
    <details><summary>Recorded review provenance</summary><p className="small">Relationship SHA-256 {review.expectedEdgeDigest}</p>
      {packet ? packet.evidenceRefs.map(ref => <p className="small" key={ref.evidenceId}>Evidence {ref.evidenceId} · recorded v{ref.version}<br />Original SHA-256 {ref.sha256}<br />Derivative SHA-256 {ref.redactedSha256}</p>) : <p className="small">Recorded evidence packet is unavailable for display.</p>}
    </details>
  </article>;
}

export function GraphRelationshipReview({ snapshot, client, userId, canManage, disabled, command, onInspect }: {
  snapshot: IncidentSnapshot; client: IncidentClient; userId?: string; canManage: boolean; disabled: boolean; command: RunCommand; onInspect: (id: string) => void;
}) {
  const [selected, setSelected] = useState("");
  const [prepared, setPrepared] = useState<{ packet: GraphEdgeReviewPreparation; edgeKey: string } | null>(null);
  const [findingId, setFindingId] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [authenticationError, setAuthenticationError] = useState<CommandError | null>(null);
  const active = useRef(true);
  const request = useRef(0);
  useEffect(() => {
    active.current = true;
    request.current++;
    setPrepared(null); setSelected(""); setError(""); setAuthenticationError(null); setLoading(false);
    const end = () => { active.current = false; request.current++; setPrepared(null); };
    window.addEventListener("breachbay-session-ending", end);
    return () => { end(); window.removeEventListener("breachbay-session-ending", end); };
  }, [client, snapshot.incident.id]);

  const relationships = snapshot.edges.filter(edge => edge.incidentId === snapshot.incident.id && reviewableRelationshipTypes.some(type => type === edge.type));
  const edge = relationships.find(item => item.id === selected);
  const authorized = canManage && snapshot.memberships.some(member => member.active && member.userId === userId && member.role === "COMMANDER");
  const hypothesis = edge?.verificationStatus === "HYPOTHESIS";
  const findings = edge ? supportingReviewedFindings(snapshot, edge) : [];
  const ready = !!edge && !!prepared && prepared.edgeKey === JSON.stringify(edge) && reviewPreparationMatches(snapshot, edge, prepared.packet);
  const verifyAllowed = !!edge && canVerifyGraphRelationship(snapshot, edge, userId, findingId);
  const name = (id: string) => snapshot.assets.find(asset => asset.id === id)?.name ?? snapshot.evidence.find(evidence => evidence.id === id)?.title ?? snapshot.indicators.find(indicator => indicator.id === id)?.normalizedValue ?? snapshot.proposals.find(proposal => proposal.id === id)?.action.type ?? id;
  async function prepare() {
    if (!edge || disabled || loading || !authorized || !hypothesis) return;
    const sequence = ++request.current;
    const edgeKey = JSON.stringify(edge);
    setPrepared(null); setError(""); setLoading(true);
    try {
      const result = await client.readGraphEdgeReview(snapshot.incident.id, edge.id);
      if (!active.current || sequence !== request.current) return;
      if (!result.ok) {
        if (result.error.code === "UNAUTHENTICATED") setAuthenticationError(result.error);
        setError(`${result.error.code}: ${result.error.message} · reference ${result.correlationId}`);
      } else if (reviewPreparationMatches(snapshot, edge, result.data)) setPrepared({ packet: result.data, edgeKey });
      else setError("Source evidence changed. Prepare a fresh review against the current server state.");
    } catch { if (active.current && sequence === request.current) setError("Review preparation was not confirmed. Request it again before submitting."); }
    finally { if (active.current && sequence === request.current) setLoading(false); }
  }
  async function submit(decision: "VERIFIED" | "DISPUTED") {
    if (!edge || !prepared || !ready || !authorized || !hypothesis || disabled || loading || !reason.trim() || (decision === "VERIFIED" && !verifyAllowed)) return;
    const sequence = request.current;
    let conflict = false;
    const accepted = await command(async () => {
      const result = await client.reviewGraphEdge({ incidentId: snapshot.incident.id, edgeId: edge.id, decision, ...(decision === "VERIFIED" ? { findingId } : {}), expectedEdgeDigest: prepared.packet.expectedEdgeDigest, evidenceRefs: prepared.packet.evidenceRefs, reason: reason.trim(), idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() });
      conflict = !result.ok && result.error.code === "VERSION_CONFLICT";
      return result;
    });
    if (!active.current || sequence !== request.current) return;
    if (accepted || conflict) setPrepared(null);
    if (accepted) { setReason(""); setFindingId(""); }
    if (conflict) setError("Relationship or evidence changed. Prepare a fresh review before retrying.");
  }
  return <section className="panel decision-body">
    <h2>Descriptive relationship review</h2>
    <p className="small">Review cited hypotheses as VERIFIED or DISPUTED. A verified description records evidence support. It does not create communication/dependency routes, change synthetic state or authorize execution.</p>
    {!relationships.length ? <p className="empty">No descriptive relationships are available for review.</p> : <label className="field-label">Relationship<select value={selected} disabled={loading || disabled} onChange={event => { request.current++; setSelected(event.target.value); setPrepared(null); setFindingId(""); setReason(""); setError(""); }}><option value="">Select a relationship</option>{relationships.map(item => <option key={item.id} value={item.id}>{name(item.fromId)} → {name(item.toId)} · {item.type} · {item.verificationStatus}</option>)}</select></label>}
    {edge && <>
      <p>{edge.type} · {edge.verificationStatus} · {edge.confidence} confidence</p>
      <p className="small">Asserted by <code>{edge.assertedBy}</code> · relationship {edge.id}</p>
      <EvidenceCitations ids={edge.sourceEvidenceIds} evidence={snapshot.evidence} onInspect={onInspect} />
      {hypothesis && <>
        {!authorized && <p className="small">An assigned human commander must review this relationship.</p>}
        <Button variant="outline" disabled={disabled || loading || !authorized} onClick={() => void prepare()}>{loading ? "Preparing authorized review…" : "Prepare review with current evidence versions"}</Button>
        {prepared && !ready && <p className="impact-warning">Relationship or evidence changed. Prepare a fresh review.</p>}
        {ready && <>
          <p className="small">Server preparation binds {prepared!.packet.evidenceRefs.length} current evidence version(s). Submission also requires a recent human sign-in.</p>
          <label className="field-label">Accepted supporting finding<select disabled={disabled || !authorized} value={findings.some(finding => finding.id === findingId) ? findingId : ""} onChange={event => setFindingId(event.target.value)}><option value="">Select an accepted finding for verification</option>{findings.map(finding => <option key={finding.id} value={finding.id}>{finding.title}</option>)}</select></label>
          {!findings.length && <p className="small">Verification needs an accepted same-incident finding covering every cited evidence ID.</p>}
          {edge.assertedBy === userId && <p className="impact-warning">Another human commander must verify a relationship you asserted. You may dispute it.</p>}
          <label className="field-label">Review reason<textarea maxLength={2000} disabled={disabled || !authorized} value={reason} onChange={event => setReason(event.target.value)} /></label>
          <div className="button-row"><Button disabled={disabled || !authorized || !verifyAllowed || !reason.trim()} onClick={() => void submit("VERIFIED")}>Submit evidence-supported verification</Button><Button variant="outline" disabled={disabled || !authorized || !reason.trim()} onClick={() => void submit("DISPUTED")}>Dispute hypothesis</Button></div>
          <p className="small">The server checks typed endpoints and evidence support. Unsupported relationships remain hypotheses.</p>
        </>}
      </>}
      {(snapshot.graphReviews ?? []).filter(review => review.incidentId === snapshot.incident.id && review.edgeId === edge.id).map(review => <RecordedReview key={review.id} review={review} />)}
    </>}
    {error && <p className="impact-warning" role="alert">{error}</p>}
    <AuthenticationRecovery error={authenticationError} />
  </section>;
}
