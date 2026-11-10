"use client";
import { useRef, useState, type RefObject } from "react";
import type { Evidence, CommandResult, Classification, CommandError } from "@/lib/contracts";
import type { EvidenceUploadCommand, IncidentClient, LogPreview } from "@/hooks/use-incident";
import type { LogFormat } from "@/lib/evidence/log-types";
import { Button } from "./ui/button";
import { AuthenticationRecovery } from "./auth/authentication-recovery";
import { LogDerivativeReview } from "./log-derivative-review";

type Command = (operation: () => Promise<CommandResult<{ id: string }>>) => Promise<boolean>;
export function OperationalEvidenceUpload({ incidentId, classification, client, disabled, hidden, attempt, command }: {
  incidentId: string; classification: Classification; client: IncidentClient; disabled: boolean; hidden: boolean; attempt: RefObject<EvidenceUploadCommand | null>; command: Command;
}) {
  const [file, setFile] = useState<File | null>(attempt.current?.file ?? null);
  const [format, setFormat] = useState<LogFormat>(attempt.current?.logFormat ?? "breachbay-jsonl");
  const [source, setSource] = useState(attempt.current?.source ?? "");
  const [host, setHost] = useState(attempt.current?.sourceHost ?? "");
  const [preview, setPreview] = useState<LogPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [authenticationError, setAuthenticationError] = useState<CommandError | null>(null);
  const [sent, setSent] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const reset = () => { attempt.current = null; setPreview(null); setFile(null); setError(""); setSent(false); if (input.current) input.current.value = ""; };
  return <section className="panel decision-body bb-log-intake" hidden={hidden}>
    <div className="bb-panel-heading"><div><h2>Bring in source logs</h2><p className="small">Review what will enter the incident before importing it.</p></div><span className="state-chip">Private intake</span></div>
    <form onSubmit={async e => {
      e.preventDefault(); if (disabled || busy || !file || !source.trim()) return;
      setBusy(true); setError(""); setAuthenticationError(null); setSent(false);
      try {
        attempt.current ??= { incidentId, file, title: file.name, source: source.trim(), sourceHost: host.trim() || undefined, logFormat: format, classification, modelApproved: false, idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() };
        if (!preview) {
          if (!client.previewEvidence) throw new Error("Log review is unavailable.");
          const result = await client.previewEvidence(attempt.current);
          if (!result.ok) { setAuthenticationError(result.error); throw new Error(result.error.message); }
          setPreview(result.data);
        } else if (await command(() => client.uploadEvidence(attempt.current!))) {
          attempt.current = null; setSent(true); setPreview(null); setFile(null); if (input.current) input.current.value = "";
        }
      } catch (e) { setError(e instanceof Error ? e.message : "Log review failed."); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={disabled || busy || Boolean(attempt.current)}>
        <label className="field-label">Log format<select value={format} onChange={e => setFormat(e.target.value as LogFormat)}><option value="breachbay-jsonl">BreachBay event JSONL</option><option value="nginx-combined">Nginx combined access log</option></select></label>
        <label className="field-label">Source system<input required value={source} maxLength={300} placeholder="Where was this log collected?" onChange={e => setSource(e.target.value)} /></label>
        {format === "nginx-combined" && <label className="field-label">Server hostname<input required value={host} maxLength={200} placeholder="app.example.com" onChange={e => setHost(e.target.value)} /></label>}
        <label className="field-label">Log file<input ref={input} required type="file" accept=".jsonl,.ndjson,.log,.txt" onChange={e => { setFile(e.target.files?.[0] ?? null); setError(""); }} /></label>
        <p className="small">UTF-8, up to 256 KiB and 100 events per batch. Original bytes stay in restricted storage. No data is sent to NVIDIA during intake.</p>
      </fieldset>
      {preview && <div className="bb-log-review"><p className="small">Host references are replaced with incident-scoped IDs. Credentials, user names, URLs and arbitrary messages are excluded from this derivative.</p><LogDerivativeReview key={preview.redactedSha256} content={preview.redactedContent} /><details><summary>Integrity records</summary><dl className="record-details"><dt>Original SHA-256</dt><dd>{preview.sha256}</dd><dt>Derivative SHA-256</dt><dd>{preview.redactedSha256}</dd></dl></details></div>}
      {error && <p role="alert" className="impact-warning">{error}</p>}
      <AuthenticationRecovery error={authenticationError} />
      {sent && <p role="status">Imported. Observed hosts and relationship hypotheses are available for review. Model access remains off.</p>}
      <Button disabled={disabled || busy || !file || !source.trim()}>{busy ? "Processing log…" : preview ? "Import reviewed log" : "Review log"}</Button>
      {attempt.current && <Button type="button" variant="outline" disabled={disabled || busy} onClick={reset}>Choose another log after checking the register</Button>}
    </form>
  </section>;
}

export function ModelEvidenceReview({ evidence, client, disabled, canReview, command }: { evidence: Evidence; client: IncidentClient; disabled: boolean; canReview: boolean; command: Command }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (evidence.classification === "SYNTHETIC" || !canReview || !client.approveEvidenceForModel) return null;
  return <details className="bb-log-review"><summary>Review external model access · {evidence.modelApproved ? "Allowed" : "Off"}</summary>
    <p className="small">Approval lets NVIDIA receive this exact derivative through incident-scoped tools. Inspect its contents before allowing access. Original bytes remain unavailable to the AI service.</p>
    <LogDerivativeReview key={evidence.redactedSha256} content={evidence.redactedContent} />
    <label className="field-label">Review reason<textarea maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} disabled={disabled || busy} /></label>
    <Button disabled={disabled || busy || !reason.trim()} onClick={async () => {
      setBusy(true);
      try { if (await command(() => client.approveEvidenceForModel!({ incidentId: evidence.incidentId, evidenceId: evidence.id, expectedVersion: evidence.version, approved: !evidence.modelApproved, reason: reason.trim(), idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() }))) setReason(""); }
      finally { setBusy(false); }
    }}>{busy ? "Recording review…" : evidence.modelApproved ? "Revoke model access" : "Allow reviewed derivative"}</Button>
  </details>;
}
