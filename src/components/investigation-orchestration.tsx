"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import type { Evidence, Investigation, InvestigationStreamEvent, ToolRun } from "@/lib/contracts";
import { orchestrationPresentation } from "@/hooks/orchestration-presentation";
import { useInterfaceMotion } from "@/hooks/use-interface-motion";
import { Activity, Check, FileText, LockKeyhole, Network } from "./ui/icons";
import { displayLabel } from "./ui/labels";
import "./investigation-orchestration.css";

export function InvestigationOrchestration({run,events,tools,evidence,onInspect,connected=true,compact=false}: {
  run: Investigation; events: InvestigationStreamEvent[]; tools: ToolRun[]; evidence: Evidence[];
  onInspect:(id:string)=>void; connected?:boolean; compact?:boolean;
}) {
  const view=useMemo(()=>orchestrationPresentation(run,events,tools),[run,events,tools]);
  const {instant,duration}=useInterfaceMotion();
  const surface=useRef<HTMLElement>(null);
  const inView=useInView(surface,{amount:0.1});
  const [pageVisible,setPageVisible]=useState(true);
  useEffect(()=>{const update=()=>setPageVisible(!document.hidden);update();document.addEventListener("visibilitychange",update);return()=>document.removeEventListener("visibilitychange",update);},[]);
  const running=connected && run.status==="RUNNING";
  const stations=[
    {key:"model",label:"Nemotron",detail:view.modelCalls.length ? `${view.modelCompleted} of ${view.modelCalls.length} calls completed` : "No model calls recorded",icon:Activity},
    {key:"tool",label:"Evidence & previews",detail:view.tools.length ? `${view.toolsCompleted} of ${view.tools.length} tools completed` : "No tools recorded",icon:Network},
    {key:"gate",label:"Validation gate",detail:view.gate,icon:LockKeyhole},
  ];
  return <section ref={surface} className={`bb-orchestration${compact ? " bb-orchestration-compact" : ""}`} data-running={running && !instant && inView && pageVisible} data-status={run.status} aria-label="Server-recorded investigation orchestration">
    <header><div><span className="bb-orchestration-label">{running ? "Investigation in progress" : "Recorded investigation"}</span><h3>{compact ? "Follow the investigation" : "The investigation, in view."}</h3></div><span className="state-chip" data-status={run.status}>{connected ? displayLabel(run.status) : `Last confirmed: ${displayLabel(run.status)}`}</span></header>
    <div className="bb-orchestration-stations">
      {stations.map(({key,label,detail,icon:Icon})=><div className="bb-orchestration-station" key={key} data-active={running && view.current?.kind===key}>
        <div className="bb-orchestration-instrument"><Icon size={21}/><span className="bb-orchestration-ring" aria-hidden="true"/></div><strong>{label}</strong><p>{detail}</p>
      </div>)}
      <div className="bb-orchestration-rail" aria-hidden="true"><i/></div>
    </div>
    <div className="bb-orchestration-current" role="status" aria-live="polite"><span className="bb-orchestration-beacon" aria-hidden="true"/>
      <AnimatePresence initial={false} mode="wait"><motion.div key={`${run.status}-${view.current?.id}-${view.current?.state}`} initial={instant ? false : {opacity:0,transform:"translateY(4px)"}} animate={{opacity:1,transform:"translateY(0px)"}} exit={{opacity:0}} transition={{duration:instant?0:duration}}><strong>{running ? view.current?.label ?? "Waiting for the next recorded step" : view.gate}</strong><p>{!connected ? "Connection interrupted. Progress animation is paused." : running ? "Updates arrive from the incident's authorized server stream." : run.status==="COMPLETED" ? "Validated output is available for human evidence review. Approval is a separate step." : run.status==="FAILED" ? "The run did not complete successfully. Its recorded calls and tools remain inspectable." : run.status==="CANCELLED" ? "No further steps are running. Earlier observations remain in the record." : "No work is claimed until the server records it."}</p></motion.div></AnimatePresence>
    </div>
    {!compact && <><ol className="bb-orchestration-ledger" aria-label="Recorded model and tool steps"><AnimatePresence initial={false}>{view.rows.slice(-6).map(row=><motion.li key={row.id} initial={instant ? false : {opacity:0,transform:"translateY(6px)"}} animate={{opacity:1,transform:"translateY(0px)"}} exit={{opacity:0}} transition={{duration:instant?0:duration}} data-state={row.state}><span className="bb-orchestration-step-icon" aria-hidden="true">{row.state==="completed" ? <Check size={14}/> : row.kind==="tool" ? <FileText size={14}/> : <Activity size={14}/>}</span><div><strong>{row.label}</strong><span>{row.step!==undefined ? `Iteration ${row.step+1} · ` : ""}{displayLabel(row.state)}{row.durationMs!==undefined ? ` · ${row.durationMs} ms` : ""}</span>{row.evidenceIds.filter(id=>evidence.some(e=>e.id===id)).slice(0,2).map(id=><button className="text-button" key={id} onClick={()=>onInspect(id)}>{evidence.find(e=>e.id===id)?.title}</button>)}</div><time dateTime={row.time}>{new Date(row.time).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</time></motion.li>)}</AnimatePresence></ol>{!view.rows.length && <p className="small muted">No model or tool observations are available in this run's scoped record.</p>}<p className="bb-orchestration-footnote">Model calls can succeed while final validation fails. This view shows recorded work; it never approves or executes a response.</p></>}
  </section>;
}
