"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { CommandError, CommandMeta, CommandResult } from "@/lib/contracts";
import { AuthenticationRecovery } from "./auth/authentication-recovery";
import type { IncidentClient, EvidenceUploadCommand, ProtectedDownload } from "@/hooks/use-incident";
import { syntheticFile } from "@/hooks/protected-transfers";
import { Button } from "./ui/button";
import { OperationalEvidenceUpload } from "./operational-evidence";
import type { Classification } from "@/lib/contracts";

export function EvidenceUpload(props: { incidentId: string; classification?: Classification; client: IncidentClient; disabled: boolean; hidden: boolean; attempt: RefObject<EvidenceUploadCommand | null>; command: (operation: () => Promise<CommandResult<{ id: string }>>) => Promise<boolean> }) {
  return props.classification && props.classification !== "SYNTHETIC" ? <OperationalEvidenceUpload {...props} classification={props.classification} /> : <SyntheticEvidenceUpload {...props} />;
}
function SyntheticEvidenceUpload({ incidentId, client, disabled, hidden, command, attempt }: {
  incidentId: string; client: IncidentClient; disabled: boolean; hidden: boolean;
  attempt: RefObject<EvidenceUploadCommand | null>;
  command: (operation: () => Promise<CommandResult<{ id: string }>>) => Promise<boolean>;
}) {
  const [file, setFile] = useState<File | null>(attempt.current?.file ?? null);
  const [title, setTitle] = useState(attempt.current?.title ?? "");
  const [captured, setCaptured] = useState("");
  const [approved, setApproved] = useState(attempt.current?.modelApproved ?? false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(Boolean(attempt.current));
  const input = useRef<HTMLInputElement>(null);
  return <section className="panel decision-body" hidden={hidden}>
    <h2>Attach synthetic evidence</h2>
    <p className="small">UTF-8 text, JSON or CSV, up to 256 KiB. Original bytes remain private; the server prepares a redacted derivative.</p>
    <details><summary>JSON log schema</summary><p className="small">JSON must contain one object with nonempty eventType and description strings. Optional string fields: assetId, sourceAssetId, destinationAssetId, indicator and outcome. Each field is limited to 1,500 characters. Asset IDs must belong to this incident; other keys, arrays and primitives are rejected.</p></details>
    <form onSubmit={async (event) => {
      event.preventDefault();
      if (disabled || !file) return;
      setError("");
      try {
        attempt.current ??= { incidentId, file: syntheticFile(file), title: title.trim() || file.name,
          ...(captured ? { capturedAt: new Date(captured).toISOString() } : {}), modelApproved: approved,
          idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() };
        setRetry(true);
        const submitted = attempt.current;
        if (await command(() => client.uploadEvidence(submitted))) {
          attempt.current = null; setRetry(false); setFile(null); setTitle(""); setCaptured(""); setApproved(false);
          if (input.current) input.current.value = "";
        }
      } catch (e) { setError(e instanceof Error ? e.message : "Unable to prepare upload."); }
    }}>
      <fieldset disabled={disabled || retry}>
        <label className="field-label">Synthetic file<input ref={input} type="file" required accept=".txt,.json,.csv" onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>
        <label className="field-label">Title<input maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label className="field-label">Captured at (optional, local time)<input type="datetime-local" value={captured} onChange={e => setCaptured(e.target.value)} /></label>
        <p className="small">If capture time is unknown, leave it blank. The server records it as unknown (Unix epoch).</p>
        <label className="workflow-row"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} /> Allow the redacted synthetic derivative to be used by the model</label>
        <p className="small">Classification: SYNTHETIC. Do not upload real incident data or secrets.</p>
      </fieldset>
      {error && <p role="alert" className="impact-warning">{error}</p>}
      {retry && <p role="status" className="small">Upload retains its original file and retry key. Inspect the evidence register before retrying.</p>}
      <Button disabled={disabled || !file}>{retry ? "Retry same upload" : "Upload evidence"}</Button>
      {retry && <Button type="button" variant="outline" disabled={disabled} onClick={() => {
        attempt.current = null; setRetry(false); setFile(null); setError("");
        if (input.current) input.current.value = "";
      }}>Choose another upload after checking the register</Button>}
    </form>
  </section>;
}

export function ProtectedDownloadControl({ client, incidentId, evidenceId, disabled, reportAttempt }: {
  client: IncidentClient; incidentId: string; evidenceId?: string; disabled: boolean;
  reportAttempt?: RefObject<CommandMeta | null>;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const localMeta = useRef<CommandMeta | null>(null);
  const [authenticationError, setAuthenticationError] = useState<CommandError | null>(null);
  const meta = reportAttempt ?? localMeta;
  const busy = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    const end = () => { active.current = false; };
    window.addEventListener("breachbay-session-ending", end);
    return () => { active.current = false; window.removeEventListener("breachbay-session-ending", end); };
  }, []);
  async function download() {
    if (disabled || busy.current) return;
    busy.current = true; setPending(true); setError(""); setMessage("");
    meta.current ??= { idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() };
    try {
      const result: CommandResult<ProtectedDownload> = evidenceId
        ? await client.downloadOriginal(evidenceId)
        : await client.exportReport({ ...meta.current, incidentId });
      if (!active.current) return;
      if (!result.ok) { if(result.error.code === "UNAUTHENTICATED") setAuthenticationError(result.error); setError(`${result.error.code}: ${result.error.message} · reference ${result.correlationId}`); return; }
      const url = URL.createObjectURL(result.data.blob);
      try {
        const link = document.createElement("a"); link.href = url; link.download = result.data.filename;
        document.body.appendChild(link); link.click(); link.remove();
      } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
      meta.current = null;
      setMessage(`Server returned authorized attachment · reference ${result.correlationId}`);
    } catch { if (active.current) setError("Download outcome unknown. Retry retains the same report key."); }
    finally { busy.current = false; if (active.current) setPending(false); }
  }
  return <div className="download-control">
    <Button variant="outline" disabled={disabled || pending} onClick={() => void download()}>{pending ? "Requesting…" : evidenceId ? "Download original" : "Export incident report"}</Button>
    {error && <p className="impact-warning" role="alert">{error}</p>}
    <AuthenticationRecovery error={authenticationError} />
    {message && <p className="small" role="status">{message}</p>}
  </div>;
}
