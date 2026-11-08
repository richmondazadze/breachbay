"use client";
import type { Evidence, InvestigationStreamEvent } from "@/lib/contracts";
import { providerCallDetails, traceDetails, type TraceDetails } from "@/hooks/trace-presentation";
const labels: Record<InvestigationStreamEvent["type"], string> = {
  run_started: "Run started", tool_started: "Tool started", tool_completed: "Tool completed", tool_failed: "Tool failed",
  provider_call_started: "Provider call started", provider_call_completed: "Provider call completed", provider_call_failed: "Provider call failed",
  finding: "Finding recorded", proposal: "Proposal recorded", run_completed: "Run completed", run_failed: "Run failed", run_cancelled: "Run cancelled",
};
export function InvestigationTrace({ events, evidence, onInspect }: {
  events: InvestigationStreamEvent[]; evidence: Evidence[]; onInspect: (id: string) => void;
}) {
  if (!events.length) return <p className="small muted">No durable stream events available for this run.</p>;
  return <details className="durable-trace">
    <summary>Server-recorded trace · {events.length} events</summary>
    <p className="small muted">Historical observations from the scoped server stream. Citation versions refer to the data retrieved during this run. A provider call completion does not establish investigation completion. A started call without a terminal record has an unconfirmed outcome; the server-recorded run status remains authoritative.</p>
    <ol>{[...events].sort((a, b) => a.time.localeCompare(b.time) || a.eventId.localeCompare(b.eventId)).map(event => {
      const providerEvent = event.type.startsWith("provider_call_");
      const provider = providerCallDetails(event);
      const data: TraceDetails = providerEvent ? { citations: [] } : traceDetails(event.dataJson);
      return <li key={event.eventId}>
        <strong>{labels[event.type]}</strong> {event.tool && <code>{event.tool}</code>}
        <p className="small"><time dateTime={event.time}>{event.time}</time> · {event.provider ?? "Provider unconfirmed"} / {event.model ?? "Model unconfirmed"}</p>
        {providerEvent && (provider ? <div className="provider-observation">
          <dl><dt>Request ID</dt><dd><code>{provider.providerCallId}</code></dd><dt>Provider endpoint</dt><dd>{provider.endpoint}</dd><dt>Context classification</dt><dd>{provider.classification} · sanitized context required</dd><dt>Request mode</dt><dd>{provider.mode === "final_json" ? "Native JSON finalization" : "Tool-enabled inference"}</dd><dt>Step</dt><dd>{provider.step} (zero-based)</dd><dt>Recorded outcome</dt><dd>{provider.outcome}</dd>{provider.durationMs !== undefined && <><dt>Provider latency</dt><dd>{provider.durationMs} ms</dd></>}{provider.finishReason && <><dt>Finish reason</dt><dd>{provider.finishReason}</dd></>}{provider.code && <><dt>Failure code</dt><dd>{provider.code}</dd></>}<dt>Usage attribution</dt><dd>{provider.usageSource === "reported" ? "Provider-reported token counts" : provider.usageSource === "estimated" ? "Estimated request budget ceiling" : "Unavailable"}</dd>
          {provider.usageSource === "reported" && <><dt>Reported prompt tokens</dt><dd>{provider.promptTokens ?? "Unavailable"}</dd><dt>Reported completion tokens</dt><dd>{provider.completionTokens ?? "Unavailable"}</dd><dt>Reported total tokens</dt><dd>{provider.totalTokens ?? "Unavailable"}</dd></>}
          <dt>Monetary cost</dt><dd>Unknown · no pricing estimate available</dd></dl>
          {provider.usageEstimate && <details className="small"><summary>Estimated request budget ceiling</summary><p>Conservative bounds from UTF-8 request bytes plus overhead and the configured completion budget. These bounds do not measure consumed tokens, including for failed requests.</p><dl><dt>Prompt token upper bound</dt><dd>{provider.usageEstimate.promptTokensUpperBound}</dd><dt>Completion token upper bound</dt><dd>{provider.usageEstimate.completionTokensUpperBound}</dd><dt>Total token upper bound</dt><dd>{provider.usageEstimate.totalTokensUpperBound}</dd></dl></details>}
        </div> : <p className="small muted">Allowlisted provider metadata unavailable for this observation.</p>)}
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
        <details className="small"><summary>Event reference</summary><p>Event {event.eventId} · reference {event.correlationId}</p></details>
      </li>;
    })}</ol>
  </details>;
}
