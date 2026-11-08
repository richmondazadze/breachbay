"use client";
import { useState } from "react";
import type { IncidentClient } from "@/hooks/use-incident";
import type { ActionType, CommandResult, IncidentSnapshot, IncidentStatus, Finding, GraphEdgeType, Confidence } from "@/lib/contracts";
import { Button } from "./ui/button";
import { displayLabel } from "./ui/labels";
export type RunCommand = (operation: () => Promise<CommandResult<{ id: string }>>) => Promise<boolean>;
const transitions: Record<IncidentStatus, IncidentStatus[]> = { NEW: ["TRIAGED"], TRIAGED: ["INVESTIGATING"], INVESTIGATING: ["CONTAINMENT_PENDING"], CONTAINMENT_PENDING: ["CONTAINING"], CONTAINING: ["RECOVERING"], RECOVERING: ["RESOLVED"], RESOLVED: ["ARCHIVED", "INVESTIGATING"], ARCHIVED: [] };
const meta = (incidentId: string) => ({ incidentId, idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() });
function EvidenceSelection({ snapshot, selected, onChange, disabled }: {snapshot: IncidentSnapshot; selected: string[]; onChange: (ids: string[]) => void; disabled: boolean}) {
  return <fieldset className="evidence-selection" disabled={disabled}><legend>Supporting evidence</legend>
    {snapshot.evidence.map(e => <label className="workflow-row" key={e.id}><input type="checkbox" checked={selected.includes(e.id)} onChange={event => onChange(event.target.checked ? [...selected,e.id] : selected.filter(id=>id!==e.id))} />{e.title}</label>)}
    {!snapshot.evidence.length && <p className="small">Attach evidence before submitting.</p>}
  </fieldset>;
}
export function IncidentLifecycle({ snapshot, client, disabled, canManage, command }: {snapshot: IncidentSnapshot; client: IncidentClient; disabled: boolean; canManage: boolean; command: RunCommand}) {
  const [target, setTarget] = useState<IncidentStatus | "">(""); const [reason, setReason] = useState("");
  const available = transitions[snapshot.incident.status];
  return <details className="panel decision-body lifecycle-control"><summary>Incident lifecycle · {displayLabel(snapshot.incident.status)}</summary>
    <p className="small">Lifecycle changes are server confirmed. Changing status does not establish containment or restore a service.</p>
    {canManage && available.length ? <form onSubmit={async e => {e.preventDefault(); if (!target || !available.includes(target)) return; if (await command(()=>client.transitionIncident({...meta(snapshot.incident.id),status:target,reason:reason.trim(),expectedVersion:snapshot.incident.version}))) {setTarget("");setReason("");} }}>
      <label className="field-label">Next status<select required value={available.includes(target as IncidentStatus) ? target : ""} disabled={disabled} onChange={e=>setTarget(e.target.value as IncidentStatus)}><option value="">Choose transition</option>{available.map(status=><option key={status} value={status}>{displayLabel(status)}</option>)}</select></label>
      <label className="field-label">Reason<textarea required maxLength={2000} value={reason} disabled={disabled} onChange={e=>setReason(e.target.value)} /></label>
      <Button disabled={disabled || !reason.trim() || !available.includes(target as IncidentStatus)}>Submit status change</Button>
    </form> : <p className="small muted">{available.length ? "Incident management permission required." : "This lifecycle state has no further transitions."}</p>}
  </details>;
}
export function ManualProposal({ snapshot: s, client, disabled, canPropose, command }: {snapshot: IncidentSnapshot; client: IncidentClient; disabled: boolean; canPropose: boolean; command: RunCommand}) {
  const [type,setType]=useState<ActionType>("ISOLATE_SIMULATED_HOST");const [target,setTarget]=useState("");const [rationale,setRationale]=useState("");const [evidence,setEvidence]=useState<string[]>([]);const [assumptions,setAssumptions]=useState("");const [unknowns,setUnknowns]=useState("");
  const names = new Map(s.assets.map(a=>[a.id,a.name]));
  const targets = type === "BLOCK_SIMULATED_ROUTE" ? s.edges.filter(e=>e.enabled && e.type==="COMMUNICATES_WITH" && e.verificationStatus==="VERIFIED").map(e=>({id:e.id,name:`${names.get(e.fromId) ?? e.fromId} → ${names.get(e.toId) ?? e.toId}`})) : s.assets.filter(a=>type==="ISOLATE_SIMULATED_HOST" ? a.type==="HOST" && a.state!=="ISOLATED" : s.edges.some(e=>e.fromId===a.id && e.credentialId && e.enabled)).map(a=>({id:a.id,name:a.name}));
  const allowed = canPropose && s.incident.classification==="SYNTHETIC" && ["INVESTIGATING","CONTAINMENT_PENDING","CONTAINING"].includes(s.incident.status);
  return <details className="panel decision-body manual-proposal"><summary>Plan a manual synthetic response</summary><p className="small">Available without AI. Submit an evidence-backed proposal, then preview service impact and obtain separate human approval before synthetic execution. Another authorized human must approve a proposal you request.</p>
    {!allowed && <p className="impact-warning">Proposal permission and an incident in a response stage are required.</p>}
    <form onSubmit={async e=>{e.preventDefault();if(!allowed || !targets.some(t=>t.id===target))return; const lines=(value:string)=>value.split("\n").map(x=>x.trim()).filter(Boolean); if(await command(()=>client.proposeAction({...meta(s.incident.id),action:{type,targetIds:[target]},rationale:rationale.trim(),evidenceIds:evidence.filter(id=>s.evidence.some(e=>e.id===id)),assumptions:lines(assumptions),uncertainty:lines(unknowns),expectedVersion:s.incident.scenarioVersion}))) {setRationale("");setEvidence([]);setAssumptions("");setUnknowns("");} }}>
      <fieldset disabled={disabled || !allowed}><label className="field-label">Synthetic action<select value={type} onChange={e=>{setType(e.target.value as ActionType);setTarget("");}}><option value="ISOLATE_SIMULATED_HOST">Isolate host</option><option value="BLOCK_SIMULATED_ROUTE">Block communication route</option><option value="RESET_SIMULATED_CREDENTIAL">Reset attributed credential</option></select></label>
      <label className="field-label">Target<select required value={targets.some(t=>t.id===target)?target:""} onChange={e=>setTarget(e.target.value)}><option value="">Choose target</option>{targets.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label className="field-label">Rationale<textarea required maxLength={4000} value={rationale} onChange={e=>setRationale(e.target.value)} /></label>
      <label className="field-label">Assumptions (one per line)<textarea maxLength={4000} value={assumptions} onChange={e=>setAssumptions(e.target.value)} /></label>
      <label className="field-label">Unresolved questions (one per line)<textarea maxLength={4000} value={unknowns} onChange={e=>setUnknowns(e.target.value)} /></label></fieldset>
      <EvidenceSelection snapshot={s} selected={evidence} onChange={setEvidence} disabled={disabled || !allowed} />
      <Button disabled={disabled || !allowed || !target || !rationale.trim() || !evidence.length}>Submit manual proposal · scenario v{s.incident.scenarioVersion}</Button>
    </form>
  </details>;
}
export function FindingReview({finding,incidentId,client,disabled,canManage,command}:{finding:Finding;incidentId:string;client:IncidentClient;disabled:boolean;canManage:boolean;command:RunCommand}) {
  const [reason,setReason]=useState("");
  if(finding.verificationStatus!=="HYPOTHESIS")return <p className="small">Review status: {displayLabel(finding.verificationStatus)}</p>;
  return <details><summary>Review finding against evidence</summary><p className="small">Acceptance records human evidence review. It does not automatically create a communication route or verify an inferred relationship.</p><label className="field-label">Verification reason<textarea maxLength={1000} value={reason} disabled={disabled || !canManage} onChange={e=>setReason(e.target.value)} /></label><Button disabled={disabled || !canManage || !reason.trim()} onClick={()=>void command(()=>client.acceptFinding({...meta(incidentId),findingId:finding.id,reason:reason.trim()}))}>Accept finding</Button></details>;
}
export function EvidenceRelationship({snapshot:s,client,disabled,canAttach,command}:{snapshot:IncidentSnapshot;client:IncidentClient;disabled:boolean;canAttach:boolean;command:RunCommand}) {
  const [from,setFrom]=useState("");const [to,setTo]=useState("");const [type,setType]=useState<GraphEdgeType>("OBSERVED_ON");const [confidence,setConfidence]=useState<Confidence>("LOW");const [evidence,setEvidence]=useState<string[]>([]);
  const nodes=[...s.assets.map(a=>({id:a.id,name:`Asset · ${a.name}`})),...s.evidence.map(e=>({id:e.id,name:`Evidence · ${e.title}`})),...s.indicators.map(i=>({id:i.id,name:`Indicator · ${i.kind} ${i.normalizedValue}`})),...s.proposals.map(p=>({id:p.id,name:`Proposal · ${p.action.type}`}))];
  return <details className="panel decision-body"><summary>Link evidence and response context</summary><p className="small">Cited relationships are stored as hypotheses. This control cannot create verified communication or service-dependency routes.</p><form onSubmit={async e=>{e.preventDefault();if(await command(()=>client.linkGraphEdge({...meta(s.incident.id),fromId:from,toId:to,type,confidence,sourceEvidenceIds:evidence}))) {setFrom("");setTo("");setEvidence([]);} }}>
    <fieldset disabled={disabled || !canAttach}>
      <label className="field-label">Source<select required value={from} onChange={e=>setFrom(e.target.value)}><option value="">Select source</option>{nodes.map(n=><option value={n.id} key={n.id}>{n.name}</option>)}</select></label>
      <label className="field-label">Relationship<select value={type} onChange={e=>setType(e.target.value as GraphEdgeType)}>{["OBSERVED_ON","INDICATES","AFFECTS","SUPPORTED_BY","TARGETS","MITIGATES"].map(t=><option key={t} value={t}>{displayLabel(t)}</option>)}</select></label>
      <label className="field-label">Target<select required value={to} onChange={e=>setTo(e.target.value)}><option value="">Select target</option>{nodes.filter(n=>n.id!==from).map(n=><option value={n.id} key={n.id}>{n.name}</option>)}</select></label>
      <label className="field-label">Confidence<select value={confidence} onChange={e=>setConfidence(e.target.value as Confidence)}>{["LOW","MEDIUM","HIGH"].map(c=><option key={c} value={c}>{displayLabel(c)}</option>)}</select></label>
    </fieldset><EvidenceSelection snapshot={s} selected={evidence} onChange={setEvidence} disabled={disabled || !canAttach}/><Button disabled={disabled || !canAttach || !from || !to || from===to || !evidence.length}>Create cited hypothesis link</Button>
  </form></details>;
}
export function AcknowledgeControl({snapshot,objectId,userId,client,disabled,command}:{snapshot:IncidentSnapshot;objectId:string;userId?:string;client:IncidentClient;disabled:boolean;command:RunCommand}) {
  const rows=snapshot.acknowledgments.filter(a=>a.objectId===objectId);const own=rows.some(a=>a.userId===userId);
  return <div className="acknowledgment-control"><Button size="sm" variant="outline" disabled={disabled || own} onClick={()=>void command(()=>client.acknowledge({...meta(snapshot.incident.id),objectId}))}>{own ? "Acknowledged by you" : "Acknowledge"}</Button><span className="small">{rows.length} server-recorded acknowledgment{rows.length===1?"":"s"}</span></div>;
}
