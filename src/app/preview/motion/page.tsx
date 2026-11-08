"use client";
import { useEffect, useState } from "react";
import { ApplicationFrame } from "@/components/application-frame";
import { InvestigationOrchestration } from "@/components/investigation-orchestration";
import { ResponseModel } from "@/components/response-model/response-model";
import { Button } from "@/components/ui/button";
import type { Investigation, InvestigationStreamEvent } from "@/lib/contracts";

const incidentId="synthetic-motion-preview",runId="synthetic-motion-run";
const time="2026-11-08T08:00:00.000Z";
const call={providerCallId:"11111111-1111-4111-8111-111111111111",step:0,mode:"tools",endpoint:"https://integrate.api.nvidia.com/v1/chat/completions",classification:"SYNTHETIC",usageSource:"unavailable",monetaryCost:"UNKNOWN"};
const nodes=[{id:"workstation",label:"Workstation",kind:"HOST",state:"COMPROMISED"},{id:"application",label:"Application host",kind:"HOST",state:"ACTIVE"},{id:"database",label:"Customer database",kind:"DATABASE",state:"ACTIVE"},{id:"jump",label:"Jump host",kind:"HOST",state:"ACTIVE"},{id:"portal",label:"Customer portal",kind:"SERVICE",state:"ACTIVE"}];
const links=[{id:"route-1",from:"workstation",to:"application",verified:true,label:"Communicates with"},{id:"route-2",from:"application",to:"database",verified:true,label:"Communicates with"},{id:"route-3",from:"workstation",to:"jump",verified:true,label:"Communicates with"},{id:"route-4",from:"jump",to:"database",verified:true,label:"Communicates with"},{id:"dependency",from:"portal",to:"application",verified:true,label:"Depends on"}];
export default function MotionPreview() {
  const [step,setStep]=useState(0),[playing,setPlaying]=useState(false),[failed,setFailed]=useState(true);
  useEffect(()=>{if(!playing)return;const timer=window.setInterval(()=>setStep(value=>Math.min(5,value+1)),1800);return()=>window.clearInterval(timer);},[playing]);
  useEffect(()=>{if(step===5)setPlaying(false);},[step]);
  const event=(index:number,type:InvestigationStreamEvent["type"],data:object,tool?:string):InvestigationStreamEvent=>({eventId:`preview-${index}`,incidentId,runId,type,time:`2026-11-08T08:00:0${index}.000Z`,correlationId:"synthetic-example",dataJson:JSON.stringify(data),tool});
  const sequence=[event(0,"run_started",{}),event(1,"provider_call_started",{...call,outcome:"started"}),event(2,"provider_call_completed",{...call,outcome:"completed",durationMs:750}),event(3,"tool_started",{toolCallId:"preview-read",step:0},"search_evidence"),event(4,"tool_completed",{toolCallId:"preview-read",step:0},"search_evidence"),event(5,failed ? "run_failed" : "run_completed",failed ? {code:"INVALID_MODEL_OUTPUT"} : {})];
  const run:Investigation={id:runId,incidentId,objective:"Synthetic interaction preview",status:step===0 ? "QUEUED" : step<5 ? "RUNNING" : failed ? "FAILED" : "COMPLETED",requestedBy:"synthetic-commander",createdAt:time,updatedAt:sequence[step].time,provider:"NVIDIA Nemotron"};
  return <ApplicationFrame title="Motion preview" synthetic preview><div className="bb-page-heading"><div><h1>Motion & orchestration preview</h1><p>Explicit synthetic examples for interaction testing. No model request, incident mutation, approval or execution occurs here.</p></div></div><div className="workflow-row"><Button onClick={()=>{if(step===5)setStep(0);setPlaying(value=>!value);}}>{playing ? "Pause example" : "Play example sequence"}</Button><Button variant="outline" onClick={()=>{setPlaying(false);setStep(0);}}>Reset example</Button><Button variant="outline" onClick={()=>{setPlaying(false);setStep(value=>Math.min(5,value+1));}}>Next recorded step</Button><label className="field-label">Example final result<select value={failed ? "failed" : "completed"} onChange={e=>setFailed(e.target.value==="failed")}><option value="failed">Validation failed</option><option value="completed">Validated result</option></select></label></div><InvestigationOrchestration run={run} events={step ? sequence.slice(0,step+1) : []} tools={[]} evidence={[]} onInspect={()=>{}}/><ResponseModel nodes={nodes} links={links} variant="operational" running={playing && run.status==="RUNNING"} title="Synthetic response model"/></ApplicationFrame>;
}
