"use client";
import type { Evidence, InvestigationStreamEvent } from "@/lib/contracts";
import { traceDetails } from "@/hooks/trace-presentation";
const labels: Record<InvestigationStreamEvent["type"], string> = {
  run_started: "Run started", tool_started: "Tool started", tool_completed: "Tool completed", tool_failed: "Tool failed",
  finding: "Finding recorded", proposal: "Proposal recorded", run_completed: "Run completed", run_failed: "Run failed", run_cancelled: "Run cancelled",
};
export function InvestigationTrace({ events, evidence, onInspect }: {
  events: InvestigationStreamEvent[]; evidence: Evidence[]; onInspect: (id: string) => void;
}) {
  if (!events.length) return <p className="small muted">No durable stream events available for this run.</p>;
  return <details className="durable-trace">
    <summary>Server-recorded trace · {events.length} events</summary>
    <p className="small muted">Historical observations from the scoped server stream. Citation versions refer to the data retrieved during this run.</p>
    <ol>{[...events].sort((a, b) => a.time.localeCompare(b.time) || a.eventId.localeCompare(b.eventId)).map(event => {
      const data = traceDetails(event.dataJson);
      return <li key={event.eventId}>
        <strong>{labels[event.type]}</strong> {event.tool && <code>{event.tool}</code>}
        <p className="small"><time dateTime={event.time}>{event.time}</time> · {event.provider ?? "Provider unconfirmed"} / {event.model ?? "Model unconfirmed"}</p>
        <dl>
          {data.step !== undefined && <><dt>Step</dt><dd>{data.step}</dd></>}
          {data.toolCallId && <><dt>Tool call</dt><dd><code>{data.toolCallId}</code></dd></>}
          {data.argumentsDigest && <><dt>Arguments SHA-256</dt><dd><code>{data.argumentsDigest}</code></dd></>}
          {data.providerLatencyMs !== undefined && <><dt>Provider latency</dt><dd>{data.providerLatencyMs} ms</dd></>}
          {data.distinctToolsCount !== undefined && <><dt>Distinct completed tools</dt><dd>{data.distinctToolsCount}</dd></>}
          {(data.failureCode || event.error?.code) && <><dt>Failure</dt><dd>{data.failureCode ?? event.error?.code}</dd></>}
        </dl>
        {data.citations.map((citation, index) => {
          const source = evidence.find(e => e.id === citation.evidenceId);
          return <div className="trace-citation" key={`${citation.evidenceId}-${index}`}>
            {source ? <button className="text-button" onClick={() => onInspect(source.id)}>{source.title}</button> : <span>Evidence unavailable in current scope</span>}
            <p className="small">{citation.evidenceId}{citation.version !== undefined && ` · retrieved version ${citation.version}`}</p>
            {citation.sha256 && <p className="small">Retrieved derivative SHA-256: <code>{citation.sha256}</code></p>}
            {source && citation.excerpt && <details><summary>Retrieved redacted excerpt</summary><pre className="evidence-content">{citation.excerpt}</pre></details>}
          </div>;
        })}
        <p className="small muted">Event {event.eventId} · reference {event.correlationId}</p>
      </li>;
    })}</ol>
  </details>;
}
