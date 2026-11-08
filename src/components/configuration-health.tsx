"use client";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
const labels = {authentication:"Authentication",backend:"Operational database",inference:"Model provider",serviceIdentity:"AI service identity",evidenceStorage:"Private evidence storage"};
type Dependency = keyof typeof labels;
export function ConfigurationHealth() {
  const [state,setState]=useState<Partial<Record<Dependency,boolean>> | null>(null); const [error,setError]=useState("");const [refresh,setRefresh]=useState(0);
  useEffect(()=>{const controller=new AbortController();setError("");void fetch("/api/health",{cache:"no-store",credentials:"same-origin",signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error();const data=await response.json();const dependencies=data?.dependencies;if(!dependencies || Object.keys(labels).some(key=>typeof dependencies[key]!=="boolean"))throw new Error();setState(Object.fromEntries(Object.keys(labels).map(key=>[key,dependencies[key]])));}).catch(()=>{if(!controller.signal.aborted){setState(null);setError("Configuration report unavailable.");}});return()=>controller.abort();},[refresh]);
  return <details className="panel decision-body configuration-health"><summary>Deployment configuration</summary><p className="small">Configuration presence only. These flags do not confirm upstream connectivity, authentication, model availability or incident grants.</p>{error?<p role="status">{error}</p>:!state?<p role="status">Loading configuration report…</p>:<dl>{(Object.keys(labels) as Dependency[]).map(key=><div key={key}><dt>{labels[key]}</dt><dd>{state[key]?"Configured":"Not configured"}</dd></div>)}</dl>}<Button variant="outline" size="sm" onClick={()=>setRefresh(n=>n+1)}>Refresh configuration report</Button></details>;
}
