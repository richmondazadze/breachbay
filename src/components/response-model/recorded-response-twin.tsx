"use client";
import { useEffect, useRef, useState } from "react";
import type { IncidentSnapshot } from "@/lib/contracts";
import type { IncidentClient } from "@/hooks/use-incident";
import { executionReplayUnavailable } from "@/hooks/execution-replay";
import { ResponseModel } from "./response-model";
import { savedTwinComparison, type SavedTwinComparison } from "./saved-comparison";
import { Button } from "../ui/button";

export interface RecordedResponseTwinProps { snapshot: IncidentSnapshot; client: Pick<IncidentClient,"readScenarioSnapshot">; connected: boolean; onInspect?: (id:string)=>void; instant?: boolean }

export function RecordedResponseTwin({snapshot,client,connected,onInspect,instant=false}:RecordedResponseTwinProps) {
  const history=snapshot.scenarioHistory ?? [];
  const target=[...history].filter(row=>row.incidentId===snapshot.incident.id && row.operation==="EXECUTION").sort((a,b)=>b.scenarioVersion-a.scenarioVersion || b.id.localeCompare(a.id))[0];
  const parent=target && history.find(row=>row.incidentId===snapshot.incident.id && row.scenarioVersion===target.parentVersion);
  const unavailable=target ? executionReplayUnavailable(target,history,snapshot.proposals) : "No recorded execution pair is available in this incident.";
  const [comparison,setComparison]=useState<SavedTwinComparison | null>(null);
  const [side,setSide]=useState<"before"|"after">("before");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const generation=useRef(0);
  useEffect(()=>{generation.current++;setComparison(null);setError("");setLoading(false);setSide("before");return()=>{generation.current++;};},[snapshot.incident.id,target?.id,target?.stateDigest,parent?.stateDigest,client,connected]);
  const current=comparison?.[side];
  return <section className="bb-saved-twin" aria-label="Saved before and after response comparison">
    <header><div><h3>Before & after the recorded response</h3><p>Exact saved scenario versions. Read only.</p></div><span className="state-chip">Historical</span></header>
    <p className="small">Current subscribed scenario: v{snapshot.incident.scenarioVersion}. Saved ACTIVE means available in the isolation model; it does not establish service health, data safety or real containment.</p>
    {!comparison && <><Button variant="outline" pending={loading} disabled={!connected || !!unavailable || !parent} onClick={async()=>{
      if(!connected || !target || !parent || unavailable) return;
      const ticket=++generation.current;setLoading(true);setError("");
      try {
        const before=await client.readScenarioSnapshot(snapshot.incident.id,parent.id);
        if(ticket!==generation.current)return;
        if(!before.ok)throw new Error(`${before.error.message} · reference ${before.correlationId}`);
        const after=await client.readScenarioSnapshot(snapshot.incident.id,target.id);
        if(ticket!==generation.current)return;
        if(!after.ok)throw new Error(`${after.error.message} · reference ${after.correlationId}`);
        const result=await savedTwinComparison(snapshot,parent,target,before.data.stateJson,after.data.stateJson);
        if(ticket===generation.current)setComparison(result);
      } catch(cause) {if(ticket===generation.current)setError(cause instanceof Error ? cause.message : "Saved comparison is unavailable.");}
      finally {if(ticket===generation.current)setLoading(false);}
    }}>{loading ? "Validating saved versions…" : target ? `Load saved v${target.parentVersion} → v${target.scenarioVersion}` : "Load saved comparison"}</Button>{(!connected || unavailable) && <p className="small muted">{!connected ? "Reconnect to read the saved versions. Current and historical state stay separate." : unavailable}</p>}</>}
    {error && <p className="impact-warning" role="alert">{error}</p>}
    {comparison && current && <>
      <div className="bb-saved-twin-switch" role="group" aria-label="Recorded scenario version"><button type="button" aria-pressed={side==="before"} onClick={()=>setSide("before")}>Before · saved v{comparison.before.version}</button><button type="button" aria-pressed={side==="after"} onClick={()=>setSide("after")}>After · saved v{comparison.after.version}</button></div>
      <p className="small" role="status">Showing {side} · saved v{current.version}. {current.links.filter(link=>link.enabled).length} enabled scenario relationships. {comparison.matchesRecordedAction ? "Client recomputation matches the saved transition." : "Client recomputation differs from the saved transition."}</p>
      <ResponseModel variant="operational" nodes={current.nodes} links={current.links} onSelect={onInspect} instant={instant} running={false} title={`${side==="before" ? "Before" : "After"} · saved scenario v${current.version}`}/>
      <details className="bb-saved-twin-record"><summary>Changes and saved provenance</summary><dl className="record-details"><dt>Parent snapshot</dt><dd><code>{comparison.parentId}</code></dd><dt>Target snapshot</dt><dd><code>{comparison.targetId}</code></dd></dl><ul>{comparison.before.nodes.filter(node=>comparison.after.nodes.find(after=>after.id===node.id)?.state!==node.state).map(node=><li key={node.id}>{node.label}: {node.state} → {comparison.after.nodes.find(after=>after.id===node.id)?.state ?? "Absent"}</li>)}{comparison.before.links.filter(link=>comparison.after.links.find(after=>after.id===link.id)?.enabled!==link.enabled).map(link=><li key={link.id}>Relationship {link.id}: {link.enabled ? "Enabled" : "Disabled"} → {comparison.after.links.find(after=>after.id===link.id)?.enabled ? "Enabled" : "Disabled"}</li>)}</ul>{!!comparison.mismatches.length && <ul>{comparison.mismatches.map(item=><li key={item}>{item}</li>)}</ul>}<p className="small">Digests and incident scope are checked before rendering. This view never executes or restores a response. Historical server verification remains separate.</p></details>
    </>}
  </section>;
}
