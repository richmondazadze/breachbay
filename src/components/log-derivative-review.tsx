"use client";

import { useMemo, useState } from "react";
import { EVENT_TYPES, type EventType } from "@/lib/evidence/log-types";
import { reviewLogDerivative } from "@/lib/evidence/derivative-review";
import { Activity, ChevronRight, Database, LockKeyhole, Network } from "./ui/icons";
import { Button } from "./ui/button";

const activity = {
  "auth.login": { label: "Logins", event: "Login attempt", icon: LockKeyhole },
  "http.request": { label: "HTTP requests", event: "HTTP request", icon: Activity },
  "database.query": { label: "Database queries", event: "Database query", icon: Database },
  "network.connection": { label: "Network connections", event: "Network connection", icon: Network },
};
const outcomes = { success: "Succeeded", failure: "Failed", observed: "Observed" };

export function LogDerivativeReview({ content }: { content: string }) {
  const review = useMemo(() => reviewLogDerivative(content), [content]);
  const [filter, setFilter] = useState<EventType | "all">("all");
  const [showAll, setShowAll] = useState(false);
  const filtered = review?.events.filter(event => filter === "all" || event.eventType === filter) ?? [];
  const shown = showAll ? filtered : filtered.slice(0, 6);
  return <div className="bb-event-review">
    {review ? <>
      <div className="bb-event-heading">
        <div><h3>{review.events.length} recorded events</h3><p>{review.hostCount} pseudonymized hosts</p></div>
        <p className="bb-event-range">Recorded in UTC<br /><time dateTime={review.start}>{review.start.replace("T", " ").replace("Z", "")}</time>{review.end !== review.start && <><span> to </span><time dateTime={review.end}>{review.end.slice(0, 10) === review.start.slice(0, 10) ? review.end.slice(11, -1) : review.end.replace("T", " ").replace("Z", "")}</time></>}</p>
      </div>
      <ul className="bb-event-counts" aria-label="Recorded activity counts">{EVENT_TYPES.filter(type => review.counts[type] > 0).map(type => {
        const Icon = activity[type].icon;
        return <li key={type}><Icon size={17} /><span>{activity[type].label}</span><strong>{review.counts[type]}</strong></li>;
      })}</ul>
      <div className="bb-event-toolbar">
        <label className="field-label">Activity type<select value={filter} onChange={e => { setFilter(e.target.value as EventType | "all"); setShowAll(false); }}><option value="all">All activity</option>{EVENT_TYPES.filter(type => review.counts[type] > 0).map(type => <option key={type} value={type}>{activity[type].label}</option>)}</select></label>
        <p role="status">Showing {shown.length} of {filtered.length} events in source order</p>
      </div>
      <ol className="bb-event-list">{shown.map(event => {
        const Icon = activity[event.eventType].icon;
        return <li key={event.line}><details className="bb-event-record"><summary>
          <span className="bb-event-kind"><Icon size={18} /><span><strong>{activity[event.eventType].event}</strong><span className="bb-event-context">Line {event.line}{event.httpMethod && ` · ${event.httpMethod}`}{event.httpStatus !== undefined && ` · HTTP ${event.httpStatus}`}{event.protocol && ` · ${event.protocol}`}</span></span></span>
          <span className="bb-event-result"><span data-outcome={event.outcome}>{outcomes[event.outcome]}</span><time dateTime={event.timestamp}>{new Date(event.timestamp).toISOString().slice(11, 23)} UTC</time></span>
          <ChevronRight className="bb-event-disclosure" size={14} />
        </summary><dl className="bb-event-fields">{Object.entries(event).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl></details></li>;
      })}</ol>
      {filtered.length > 6 && <Button type="button" variant="ghost" onClick={() => setShowAll(value => !value)}>{showAll ? "Show fewer events" : `Show all ${filtered.length} events`}</Button>}
      <p className="bb-event-note">Event outcomes describe recorded activity. They do not establish a compromise or the application’s current state.</p>
    </> : <p className="small">A structured preview is unavailable for this content. Review the exact derivative below.</p>}
    <details className="bb-event-payload" open={!review}><summary>Exact derivative · all fields</summary><pre>{content}</pre></details>
  </div>;
}
