import type { Investigation, InvestigationStreamEvent, ToolRun } from "@/lib/contracts";
import { providerCallDetails, traceDetails } from "./trace-presentation";

const toolLabels: Record<string, string> = {
  get_incident_context: "Read incident context",
  search_evidence: "Retrieve cited evidence",
  get_asset_graph: "Map asset relationships",
  correlate_indicators: "Correlate indicators",
  calculate_impact: "Calculate service impact",
  simulate_response: "Preview a response",
  get_action_status: "Read response verification",
};
export interface OrchestrationObservation {
  id: string; kind: "model" | "tool" | "gate"; label: string;
  state: "running" | "completed" | "failed" | "cancelled" | "unconfirmed";
  time: string; step?: number; durationMs?: number; evidenceIds: string[];
}

/** Derive visual state only from incident/run-scoped observations. A finished
 * model call never implies that its output passed the server's validation. */
export function orchestrationPresentation(run: Investigation, source: InvestigationStreamEvent[], toolRuns: ToolRun[] = []) {
  const live = run.status === "RUNNING";
  const events = [...new Map(source.filter(e => e.runId === run.id && e.incidentId === run.incidentId).map(e => [e.eventId,e])).values()]
    .sort((a,b) => a.time.localeCompare(b.time) || a.eventId.localeCompare(b.eventId));
  const observations = new Map<string, OrchestrationObservation>();
  const terminal = (type: string): OrchestrationObservation["state"] => type.endsWith("completed") ? "completed" : type.endsWith("failed") ? "failed" : live ? "running" : "unconfirmed";
  for (const e of events) {
    const provider = providerCallDetails(e);
    if (provider) {
      const id = `provider-${provider.providerCallId}`;
      observations.set(id, {id,kind:"model",label:provider.mode === "final_json" ? "Compose final response" : "Reason with Nemotron",state:terminal(e.type),time:e.time,step:provider.step,durationMs:provider.durationMs,evidenceIds:[]});
    } else if (["tool_started","tool_completed","tool_failed"].includes(e.type)) {
      const details = traceDetails(e.dataJson);
      const id = details.toolCallId ? `tool-${details.toolCallId}` : e.toolRun?.id ? `tool-${e.toolRun.id}` : e.eventId;
      const tool = e.tool ?? e.toolRun?.tool ?? "";
      observations.set(id,{id,kind:"tool",label:toolLabels[tool] ?? "Authorized investigation tool",state:terminal(e.type),time:e.time,step:details.step,durationMs:e.toolRun?.durationMs,evidenceIds:details.citations.map(c=>c.evidenceId)});
    }
  }
  // Older runs may predate the durable event stream. Their persisted tool rows
  // remain useful, but must never be fabricated into provider observations.
  if (!events.some(e=>e.type.startsWith("tool_"))) for (const t of toolRuns.filter(t=>t.incidentId===run.incidentId && t.investigationId===run.id)) {
    const id=`tool-${t.id}`;
    observations.set(id,{id,kind:"tool",label:toolLabels[t.tool] ?? "Authorized investigation tool",state:t.status==="COMPLETED" ? "completed" : t.status==="FAILED" ? "failed" : live ? "running" : "unconfirmed",time:t.createdAt,durationMs:t.durationMs,evidenceIds:t.evidenceIds});
  }
  const rows=[...observations.values()].sort((a,b)=>a.time.localeCompare(b.time)||a.id.localeCompare(b.id));
  const modelCalls=rows.filter(r=>r.kind==="model"), tools=rows.filter(r=>r.kind==="tool");
  const current=rows.filter(r=>r.state==="running").at(-1);
  const terminalEvent=[...events].reverse().find(e=>["run_failed","run_completed","run_cancelled"].includes(e.type));
  const failureCode=terminalEvent ? traceDetails(terminalEvent.dataJson).failureCode ?? terminalEvent.error?.code : undefined;
  return {rows,current,modelCalls,tools,failureCode,
    modelCompleted:modelCalls.filter(r=>r.state==="completed").length,
    toolsCompleted:tools.filter(r=>r.state==="completed").length,
    gate:run.status==="COMPLETED" ? "Accepted by the server" : run.status==="FAILED" ? "Investigation failed" : run.status==="CANCELLED" ? "Investigation cancelled" : run.status==="QUEUED" ? "Waiting to start" : "Awaiting the server's final result",
  };
}
