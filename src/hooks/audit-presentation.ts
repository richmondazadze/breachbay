import type { AuditEvent, IncidentSnapshot } from "@/lib/contracts";

export interface AuditFilters { actor: string; verb: string; query: string; from: string; to: string; order: "oldest" | "newest" }
export const emptyAuditFilters: AuditFilters = { actor: "", verb: "", query: "", from: "", to: "", order: "oldest" };
const timestamp = (value: string) => Date.parse(value);
export function sortAuditEvents(events: AuditEvent[]): AuditEvent[] {
  return [...events].sort((a, b) => timestamp(a.createdAt) - timestamp(b.createdAt) || a.id.localeCompare(b.id));
}
/** Datetime controls explicitly represent UTC, independent of browser timezone. */
export function filterAuditEvents(events: AuditEvent[], filters: AuditFilters): AuditEvent[] {
  const from = filters.from ? timestamp(`${filters.from}Z`) : -Infinity;
  const to = filters.to ? timestamp(`${filters.to}Z`) : Infinity;
  if (Number.isNaN(from) || Number.isNaN(to) || from > to) return [];
  const query = filters.query.trim().toLowerCase();
  const rows = sortAuditEvents(events.filter(event =>
    (!filters.actor || event.actorId === filters.actor) && (!filters.verb || event.verb === filters.verb) &&
    timestamp(event.createdAt) >= from && timestamp(event.createdAt) <= to &&
    (!query || `${event.id} ${event.objectId} ${event.actorId} ${event.correlationId} ${event.verb} ${event.detail}`.toLowerCase().includes(query)),
  ));
  return filters.order === "newest" ? rows.reverse() : rows;
}
export function incidentObjectLabel(snapshot: IncidentSnapshot, id: string): string | undefined {
  const s = snapshot;
  // Only records in this scoped snapshot are inspectable; never synthesize a foreign URL.
  if (s.incident.id === id) return `Incident · ${s.incident.title}`;
  const evidence = s.evidence.find(e => e.id === id); if (evidence) return `Evidence · ${evidence.title}`;
  const asset = s.assets.find(a => a.id === id); if (asset) return `Asset · ${asset.name}`;
  const indicator = s.indicators.find(i => i.id === id); if (indicator) return `Indicator · ${indicator.kind} ${indicator.normalizedValue}`;
  const proposal = s.proposals.find(p => p.id === id); if (proposal) return `Proposal · ${proposal.action.type.replaceAll("_", " ")}`;
  const target = s.operationalTargets?.find(t => t.id === id); if (target) return `Application target · ${target.name}`;
  const response = s.operationalResponses?.find(r => r.id === id); if (response) return `Application response · ${response.operation === "DISABLE_APPLICATION_LOGIN" ? "Disable access" : "Restore login"}`;
  const finding = s.findings.find(f => f.id === id); if (finding) return `Finding · ${finding.title}`;
  const edge = s.edges.find(e => e.id === id);
  if (edge) return `Relationship · ${edge.type}`;
  const run = s.investigations.find(r => r.id === id); if (run) return `Investigation · ${run.status}`;
  const task = s.tasks.find(t => t.id === id); if (task) return `Task · ${task.title}`;
  if (s.approvals.some(a => a.id === id)) return "Human approval record";
  if (s.verifications.some(v => v.id === id)) return "Synthetic verification record";
  if (s.simulations.some(b => b.id === id)) return "Synthetic preview record";
  if (s.graphReviews?.some(r => r.id === id)) return "Relationship review record";
  if (s.reports.some(r => r.id === id)) return "Report export record";
  if (s.retentionPolicy?.id === id) return "Preservation policy record";
  return undefined;
}
