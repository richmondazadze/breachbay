"use client";
import { useEffect, useRef, useState } from "react";
import type { IncidentClient } from "@/hooks/use-incident";
import type { CommandError, IncidentSnapshot, Investigation } from "@/lib/contracts";
import { AuthenticationRecovery } from "./auth/authentication-recovery";
import { scenarioReplay, type ReplayView } from "@/hooks/scenario-replay";
import { scenarioFromSnapshot } from "@/lib/simulation/contracts-adapter";
import type { RunCommand } from "./incident-operations";
import { Button } from "./ui/button";
const meta=(incidentId:string)=>({incidentId,idempotencyKey:crypto.randomUUID(),correlationId:crypto.randomUUID()});
export function ScenarioComparison({ replay, snapshot }: { replay: ReplayView; snapshot: IncidentSnapshot }) {
  let current: ReturnType<typeof scenarioFromSnapshot>;
  try { current = scenarioFromSnapshot(snapshot); }
  catch { return <p className="impact-warning">Current scoped synthetic state is unavailable for comparison.</p>; }
  const name = (id:string) => snapshot.assets.find(asset=>asset.id===id)?.name ?? id;
  const ids = [...new Set([...replay.assets.map(asset=>asset.id),...current.assets.map(asset=>asset.id)])];
  const edges = [...new Set([...replay.edges.map(edge=>edge.id),...current.edges.map(edge=>edge.id)])];
  return <section aria-label="Historical and current synthetic state comparison">
    <h3>Saved v{replay.version} compared with current v{current.version}</h3>
    <p className="small">Scenario ACTIVE means available in the isolation model. Consult live asset status for compromise and service health. Current values come from the authorized server subscription.</p>
    <div className="scenario-comparison-scroll" role="region" aria-label="Asset state comparison" tabIndex={0}><table><thead><tr><th scope="col">Asset</th><th scope="col">Saved scenario state</th><th scope="col">Current scenario state</th><th scope="col">Saved credential</th><th scope="col">Current credential</th></tr></thead><tbody>
      {ids.map(id=>{const saved=replay.assets.find(asset=>asset.id===id);const live=current.assets.find(asset=>asset.id===id);return <tr key={id}><th scope="row">{name(id)}</th><td>{saved?.state ?? "Not recorded"}</td><td>{live?.state ?? "Unavailable"}</td><td>{saved ? saved.credentialEnabled ? "Enabled" : "Disabled" : "Not recorded"}</td><td>{live ? live.credentialEnabled ? "Enabled" : "Disabled" : "Unavailable"}</td></tr>;})}
    </tbody></table></div>
    <h4>Communication and dependency links</h4>
    <div className="scenario-comparison-scroll" role="region" aria-label="Link state comparison" tabIndex={0}><table><thead><tr><th scope="col">Link</th><th scope="col">Saved state</th><th scope="col">Current state</th></tr></thead><tbody>
      {edges.map(id=>{const saved=replay.edges.find(edge=>edge.id===id);const live=current.edges.find(edge=>edge.id===id);return <tr key={id}><th scope="row">{live ? `${name(live.from)} → ${name(live.to)} · ${live.type}` : id}</th><td>{saved ? saved.enabled ? "Enabled" : "Disabled" : "Not recorded"}</td><td>{live ? live.enabled ? "Enabled" : "Disabled" : "Unavailable"}</td></tr>;})}
    </tbody></table></div>
  </section>;
}
export function ScenarioHistory({snapshot:s,client,disabled,canRead,canRestore,command}:{snapshot:IncidentSnapshot;client:IncidentClient;disabled:boolean;canRead:boolean;canRestore:boolean;command:RunCommand}) {
  const [selected,setSelected]=useState("");const [replay,setReplay]=useState<ReplayView|null>(null);const [loading,setLoading]=useState(false);const [error,setError]=useState("");const [reason,setReason]=useState("");const active=useRef(true);const request=useRef(0);
  const [authenticationError,setAuthenticationError]=useState<CommandError|null>(null);
  useEffect(()=>{active.current=true;return()=>{active.current=false;request.current++;};},[]);
  const history=[...(s.scenarioHistory??[])].sort((a,b)=>b.scenarioVersion-a.scenarioVersion);
  const target=history.find(h=>h.id===selected);
  const allowed=canRestore && s.incident.classification==="SYNTHETIC" && ["INVESTIGATING","CONTAINMENT_PENDING","CONTAINING"].includes(s.incident.status);
  return <details className="panel decision-body scenario-history"><summary>Synthetic scenario history · current v{s.incident.scenarioVersion}</summary>
    <p className="small">Replay is read-only. Restoration applies saved synthetic state as a new version; it preserves evidence, approvals and audit history. Earlier approvals remain historical and do not authorize the new version.</p>
    <Button variant="outline" disabled={disabled || !canRead} onClick={()=>void command(()=>client.checkpointScenario(meta(s.incident.id)))}>Checkpoint current state</Button>
    {!history.length?<p className="small">No saved checkpoints available. Older versions cannot be reconstructed if they were never recorded.</p>:<label className="field-label">Recorded snapshot<select value={selected} disabled={disabled || !canRead || loading} onChange={async e=>{
      const id=e.target.value;setSelected(id);setReplay(null);setReason("");setError("");const sequence=++request.current;if(!id)return;
      const snapshot=history.find(h=>h.id===id);if(!snapshot)return;setLoading(true);
      try {const result=await client.readScenarioSnapshot(s.incident.id,id);if(!active.current || sequence!==request.current)return;if(!result.ok){if(result.error.code === "UNAUTHENTICATED")setAuthenticationError(result.error);throw new Error(`${result.error.code}: ${result.error.message} · reference ${result.correlationId}`);}const data=await scenarioReplay(result.data.stateJson,s.incident.id,snapshot.stateDigest);if(data.version!==snapshot.scenarioVersion)throw new Error("Saved snapshot version mismatch.");if(active.current && sequence===request.current)setReplay(data);}catch(e){if(active.current && sequence===request.current)setError(e instanceof Error?e.message:"Replay unavailable.");}finally{if(active.current && sequence===request.current)setLoading(false);}
    }}><option value="">Select a historical version</option>{history.map(h=><option key={h.id} value={h.id}>v{h.scenarioVersion} · {h.operation} · {h.createdAt}</option>)}</select></label>}
    {loading && <p role="status">Reading authorized snapshot…</p>}{error && <p role="alert" className="impact-warning">{error}</p>}
    <AuthenticationRecovery error={authenticationError} />
    {target && <p className="small">Snapshot {target.id} · state SHA-256 {target.stateDigest}</p>}
    {replay && <><ScenarioComparison replay={replay} snapshot={s} /><p className="small">{replay.edges.filter(e=>e.enabled).length} enabled saved communication/dependency links. The saved version represents historical synthetic state.</p>
      <label className="field-label">Restoration reason<textarea maxLength={2000} disabled={disabled || !allowed} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <Button disabled={disabled || !allowed || !reason.trim()} onClick={()=>void command(()=>client.restoreScenario({...meta(s.incident.id),snapshotId:selected,reason:reason.trim(),expectedVersion:s.incident.scenarioVersion}))}>Restore saved state as new version after v{s.incident.scenarioVersion}</Button>
      {!allowed && <p className="small muted">Restoration requires commander permission, a recent human authentication factor and an active synthetic response stage.</p>}
    </>}
  </details>;
}
export function CancelInvestigation({run,client,disabled,allowed,command}:{run:Investigation;client:IncidentClient;disabled:boolean;allowed:boolean;command:RunCommand}) {
  const [reason,setReason]=useState("");
  if(!["QUEUED","RUNNING"].includes(run.status))return null;
  return <details><summary>Cancel this investigation</summary><p className="small">Only its human requester or an assigned commander can cancel. Existing traces are retained. Further results are rejected after server-confirmed cancellation; wait for the run to show CANCELLED.</p><label className="field-label">Cancellation reason<textarea maxLength={2000} disabled={disabled || !allowed} value={reason} onChange={e=>setReason(e.target.value)}/></label><Button variant="outline" disabled={disabled || !allowed || !reason.trim()} onClick={()=>void command(()=>client.cancelInvestigation({...meta(run.incidentId),runId:run.id,reason:reason.trim()}))}>Request server cancellation</Button></details>;
}
