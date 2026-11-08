"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import type { Evidence, Investigation, InvestigationStreamEvent, ToolRun } from "@/lib/contracts";
import { orchestrationPresentation } from "@/hooks/orchestration-presentation";
import { useInterfaceMotion } from "@/hooks/use-interface-motion";
import { Activity, AlertTriangle, ArrowUpRight, Check, FileText, Layers, LockKeyhole, UserRound } from "./ui/icons";
import { displayLabel } from "./ui/labels";
import "./investigation-orchestration.css";
const stageIcons = { evidence: FileText, model: Activity, preview: Layers, gate: LockKeyhole, review: UserRound };
const easeOut = [0.23, 1, 0.32, 1] as const;

export function InvestigationOrchestration({run,events,tools,evidence,onInspect,onReview,connected=true,compact=false}: {
  run: Investigation; events: InvestigationStreamEvent[]; tools: ToolRun[]; evidence: Evidence[];
  onInspect:(id:string)=>void; onReview?:()=>void; connected?:boolean; compact?:boolean;
}) {
  const view=useMemo(()=>orchestrationPresentation(run,events,tools),[run,events,tools]);
  const {instant,duration}=useInterfaceMotion();
  const surface=useRef<HTMLElement>(null);
  const inView=useInView(surface,{amount:0.1});
  const [pageVisible,setPageVisible]=useState(true);
  useEffect(()=>{const update=()=>setPageVisible(!document.hidden);update();document.addEventListener("visibilitychange",update);return()=>document.removeEventListener("visibilitychange",update);},[]);
  const running=connected && run.status==="RUNNING";
  const moving=running && Boolean(view.current) && !instant && inView && pageVisible;
  const sources=evidence.filter(e=>e.incidentId===run.incidentId && view.citedEvidenceIds.includes(e.id));
  const headline=!connected ? "Live updates paused" : running ? view.current?.label ?? "Waiting for the next recorded step" : run.status==="COMPLETED" ? "Ready for your evidence review" : view.gate;
  const explanation=!connected ? "Showing the last confirmed record. Reconnect to follow new work." : running ? "Following authorized model calls and tools as the server records them." : run.status==="COMPLETED" ? "The server accepted the output. Review its evidence before trusting a finding or approving a response." : run.status==="FAILED" ? "The run failed. Completed calls remain in the record; they do not establish a valid result." : run.status==="CANCELLED" ? "Processing stopped. Earlier observations remain available." : "The server has not recorded any processing yet.";
  return <section ref={surface} className={`bb-orchestration${compact ? " bb-orchestration-compact" : ""}`} data-running={moving} data-connected={connected} data-status={run.status} aria-label="Server-recorded investigation orchestration">
    <header><div><span className="bb-orchestration-label">{running ? "Live investigation" : "Investigation record"}</span><h3>Follow the investigation</h3></div><span className="state-chip" data-status={connected ? run.status : "PAUSED"}>{connected ? displayLabel(run.status) : "Disconnected"}</span></header>
    <ol className="bb-orchestration-stations" aria-label="Observed investigation stages">
      {view.stages.map(stage=>{const Icon=stageIcons[stage.id];return <li className="bb-orchestration-station" key={stage.id} data-state={stage.state} data-active={running && stage.state==="active"}>
        <div className="bb-orchestration-instrument"><Icon size={20}/>{stage.state==="observed" && <span className="bb-orchestration-check" aria-label="Recorded"><Check size={10}/></span>}<span className="bb-orchestration-ring" aria-hidden="true"/></div>
        <strong>{compact && stage.id==="review" ? "Review" : stage.label}</strong><p>{stage.detail}</p><span className="bb-orchestration-accessible">{stage.state==="ready" ? "Human decision required" : stage.state==="active" && !connected ? "Last confirmed active" : displayLabel(stage.state)}</span>
      </li>;})}
    </ol>
    <div className="bb-orchestration-current" role="status" aria-live="polite"><span className="bb-orchestration-beacon" aria-hidden="true">{run.status==="FAILED" ? <AlertTriangle size={16}/> : run.status==="COMPLETED" ? <UserRound size={16}/> : <Activity size={16}/>}</span>
      <AnimatePresence initial={false} mode="wait"><motion.div key={`${connected}-${run.status}-${view.current?.id}-${view.current?.state}`} initial={instant ? false : {opacity:0,transform:"translateY(4px)"}} animate={{opacity:1,transform:"translateY(0px)"}} exit={{opacity:0,transform:"translateY(4px)"}} transition={{duration:instant?0:duration,ease:easeOut}}><strong>{headline}</strong><p>{explanation}</p></motion.div></AnimatePresence>
    </div>
    {!compact && <div className="bb-orchestration-results">
      <div className="bb-orchestration-sources"><span className="bb-orchestration-label">Cited evidence</span>{sources.length ? <div className="bb-orchestration-source-list">{sources.slice(0,3).map(source=><button key={source.id} onClick={()=>onInspect(source.id)}><FileText size={16}/><span>{source.title}</span><ArrowUpRight size={14}/></button>)}{sources.length>3 && <span className="small muted">{sources.length-3} more sources in the record below</span>}</div> : <p>No matching cited sources recorded yet.</p>}</div>
      <div className="bb-orchestration-output"><span className="bb-orchestration-label">Recorded output</span><div><FileText size={17}/><strong>{view.findingsRecorded}</strong><span>{view.findingsRecorded===1 ? "finding" : "findings"}</span></div><div><Layers size={17}/><strong>{view.proposalsRecorded}</strong><span>{view.proposalsRecorded===1 ? "response proposal" : "response proposals"}</span></div><p>{run.status==="COMPLETED" ? "Available for human review" : "Final validation is still required"}</p></div>
    </div>}
    {run.status==="COMPLETED" && onReview && <button className="bb-orchestration-review" onClick={onReview}><UserRound size={16}/><span>Review findings</span><ArrowUpRight size={16}/></button>}
    {!compact && <details className="bb-orchestration-details"><summary>Recorded activity <span>{view.modelCompleted} model calls · {view.toolsCompleted} tools completed</span></summary><ol className="bb-orchestration-ledger" aria-label="Recorded model and tool steps"><AnimatePresence initial={false}>{view.rows.map(row=><motion.li key={row.id} initial={instant ? false : {opacity:0,transform:"translateY(6px)"}} animate={{opacity:1,transform:"translateY(0px)"}} exit={{opacity:0,transform:"translateY(6px)"}} transition={{duration:instant?0:duration,ease:easeOut}} data-state={row.state}><span className="bb-orchestration-step-icon" aria-hidden="true">{row.state==="completed" ? <Check size={14}/> : row.kind==="tool" ? <FileText size={14}/> : <Activity size={14}/>}</span><div><strong>{row.label}</strong><span>{row.step!==undefined ? `Iteration ${row.step+1} · ` : ""}{displayLabel(row.state)}{row.durationMs!==undefined ? ` · ${row.durationMs} ms` : ""}</span>{row.evidenceIds.filter(id=>sources.some(e=>e.id===id)).map(id=><button className="text-button" key={id} onClick={()=>onInspect(id)}>{sources.find(e=>e.id===id)?.title}</button>)}</div><time dateTime={row.time}>{new Date(row.time).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</time></motion.li>)}</AnimatePresence></ol>{!view.rows.length && <p className="small muted">No model or tool observations are available in this run's scoped record.</p>}</details>}
  </section>;
}
