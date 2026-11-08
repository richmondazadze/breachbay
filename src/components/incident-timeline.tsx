"use client";
import { useState } from "react";
import type { IncidentSnapshot } from "@/lib/contracts";
import { emptyAuditFilters, filterAuditEvents, incidentObjectLabel, type AuditFilters } from "@/hooks/audit-presentation";
import { Button } from "./ui/button";

export function IncidentTimeline({ snapshot, onInspect }: { snapshot: IncidentSnapshot; onInspect: (id: string) => void }) {
  const [filters, setFilters] = useState(emptyAuditFilters);
  const [limit, setLimit] = useState(50);
  const update = <K extends keyof AuditFilters>(key: K, value: AuditFilters[K]) => { setFilters(previous => ({ ...previous, [key]: value })); setLimit(50); };
  const rows = filterAuditEvents(snapshot.auditEvents, filters);
  const invalidRange = !!filters.from && !!filters.to && filters.from > filters.to;
  return <section className="panel incident-timeline" id="server-audit-timeline" aria-labelledby="audit-title">
    <div className="panel-title"><h2 id="audit-title">Server audit timeline</h2></div>
    <div className="audit-filters">
      <label className="field-label">Actor<select value={filters.actor} onChange={e => update("actor", e.target.value)}><option value="">All actors</option>{[...new Set(snapshot.auditEvents.map(e => e.actorId))].sort().map(id => <option key={id} value={id}>{snapshot.memberships.find(m => m.userId === id)?.role ?? "Recorded actor"} · {id}</option>)}</select></label>
      <label className="field-label">Event type<select value={filters.verb} onChange={e => update("verb", e.target.value)}><option value="">All event types</option>{[...new Set(snapshot.auditEvents.map(e => e.verb))].sort().map(verb => <option key={verb}>{verb}</option>)}</select></label>
      <label className="field-label">Search details or reference<input type="search" value={filters.query} onChange={e => update("query", e.target.value)} /></label>
      <label className="field-label">From (UTC)<input type="datetime-local" step="1" value={filters.from} onChange={e => update("from", e.target.value)} /></label>
      <label className="field-label">Through (UTC)<input type="datetime-local" step="1" value={filters.to} onChange={e => update("to", e.target.value)} /></label>
      <label className="field-label">Event order<select value={filters.order} onChange={e => update("order", e.target.value as AuditFilters["order"])}><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select></label>
      <Button type="button" variant="outline" onClick={() => { setFilters(emptyAuditFilters); setLimit(50); }}>Clear filters</Button>
    </div>
    <p className="small audit-count" role="status">{invalidRange ? "From must precede Through." : `${rows.length} of ${snapshot.auditEvents.length} subscribed events match · showing ${Math.min(limit, rows.length)}`}</p>
    <p className="small muted audit-note">Sorted by recorded UTC time. Events sharing a timestamp use ID order; this does not establish which operation happened first.</p>
    <ol className="timeline audit-events">{rows.slice(0, limit).map(event => {
      const object = incidentObjectLabel(snapshot, event.objectId);
      return <li className="timeline-row" key={event.id}>
        <time dateTime={event.createdAt}>{event.createdAt}</time><div>
          <strong>{event.verb}</strong>{event.detail && <p>{event.detail}</p>}
          {object ? <Button type="button" variant="ghost" onClick={() => onInspect(event.objectId)}>Inspect {object}</Button> : <p className="small muted">Referenced object unavailable in this snapshot.</p>}
          <details className="audit-provenance"><summary>Actor and audit provenance</summary><dl>
            <dt>Actor ID</dt><dd>{event.actorId}</dd><dt>Object ID</dt><dd>{event.objectId}</dd><dt>Correlation reference</dt><dd>{event.correlationId}</dd><dt>Audit event ID</dt><dd>{event.id}</dd><dt>Previous SHA-256</dt><dd>{event.previousHash || "Initial event"}</dd><dt>Event SHA-256</dt><dd>{event.hash}</dd>
          </dl></details>
        </div>
      </li>;
    })}</ol>
    {!rows.length && !invalidRange && <p className="empty">No events match these filters.</p>}
    {rows.length > limit && <div className="audit-more"><Button type="button" variant="outline" onClick={() => setLimit(value => value + 50)}>Show 50 more events</Button></div>}
  </section>;
}
