import type { IncidentSnapshot } from "../contracts";
/** Caller must first validate the original command receipt and current INVESTIGATE grant. */
export function completedRunResult(snapshot: IncidentSnapshot, runId: string) {
  const run=snapshot.investigations.find(r=>r.id===runId && r.incidentId===snapshot.incident.id);
  if(run?.status!=="COMPLETED")return undefined;
  const proposal=snapshot.proposals.find(p=>p.incidentId===run.incidentId && p.investigationId===runId);
  const planning=proposal?.planning??run.planning;
  return {runId, ...(planning?{planning}:{}), findings:snapshot.findings.filter(f=>f.incidentId===run.incidentId && f.investigationId===runId).map(f=>({summary:f.summary,confidence:f.confidence,evidenceIds:f.evidenceIds,unknowns:f.unknowns,...(f.recommendedNextQueries===undefined?{}:{recommendedNextQueries:f.recommendedNextQueries})})),proposalId:proposal?.id};
}
