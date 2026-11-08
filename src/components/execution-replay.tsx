"use client";
import { useEffect, useRef, useState } from "react";
import type { CommandError, IncidentSnapshot, ScenarioSnapshot } from "@/lib/contracts";
import type { IncidentClient } from "@/hooks/use-incident";
import { executionReplayUnavailable, replayRecordedExecution, type ExecutionReplayResult } from "@/hooks/execution-replay";
import { AuthenticationRecovery } from "./auth/authentication-recovery";
import { Button } from "./ui/button";

export function ExecutionReplay({ snapshot, target, client, disabled, canRead }: { snapshot: IncidentSnapshot; target: ScenarioSnapshot; client: IncidentClient; disabled: boolean; canRead: boolean }) {
  const [result, setResult] = useState<ExecutionReplayResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [authenticationError, setAuthenticationError] = useState<CommandError | null>(null);
  const generation = useRef(0);
  useEffect(() => { generation.current++; setResult(null); setError(""); setLoading(false); return () => { generation.current++; }; }, [target.id, client, disabled, canRead]);
  const unavailable = executionReplayUnavailable(target, snapshot.scenarioHistory ?? [], snapshot.proposals);
  return <section className="execution-replay" aria-label="Read-only recorded execution replay">
    <h3>Replay the recorded execution</h3>
    <p className="small">Client analysis of the exact saved parent and target snapshots using the recorded proposal action and BreachBay’s deterministic simulation rules. This does not execute a response, restore state or grant approval. The server’s historical verification remains separate.</p>
    {unavailable ? <p className="small muted">{unavailable}</p> : <Button type="button" variant="outline" disabled={disabled || !canRead || loading} onClick={async () => {
      const parent = snapshot.scenarioHistory?.find(row => row.incidentId === snapshot.incident.id && row.scenarioVersion === target.parentVersion);
      const proposal = snapshot.proposals.find(row => row.incidentId === snapshot.incident.id && row.id === target.proposalId);
      if (!parent || !proposal || disabled || !canRead) return;
      const sequence = ++generation.current;
      setLoading(true); setResult(null); setError(""); setAuthenticationError(null);
      try {
        const parentRead = await client.readScenarioSnapshot(snapshot.incident.id, parent.id);
        if (sequence !== generation.current) return;
        if (!parentRead.ok) { if (parentRead.error.code === "UNAUTHENTICATED") setAuthenticationError(parentRead.error); throw new Error(`${parentRead.error.code}: ${parentRead.error.message} · reference ${parentRead.correlationId}`); }
        const targetRead = await client.readScenarioSnapshot(snapshot.incident.id, target.id);
        if (sequence !== generation.current) return;
        if (!targetRead.ok) { if (targetRead.error.code === "UNAUTHENTICATED") setAuthenticationError(targetRead.error); throw new Error(`${targetRead.error.code}: ${targetRead.error.message} · reference ${targetRead.correlationId}`); }
        const replay = await replayRecordedExecution({ incidentId: snapshot.incident.id, parent, target, proposal, parentJson: parentRead.data.stateJson, targetJson: targetRead.data.stateJson });
        if (sequence === generation.current) setResult(replay);
      } catch (cause) { if (sequence === generation.current) setError(cause instanceof Error ? cause.message : "Recorded execution replay unavailable."); }
      finally { if (sequence === generation.current) setLoading(false); }
    }}>Replay saved v{target.parentVersion} → v{target.scenarioVersion} · read only</Button>}
    {loading && <p className="small" role="status">Reading and validating both saved snapshots…</p>}
    {error && <p className="impact-warning" role="alert">{error}</p>}
    <AuthenticationRecovery error={authenticationError} />
    {result && <>
      <p className={result.match ? "teal" : "impact-warning"} role="status">{result.match ? "Replay matches the saved target state." : "Replay differs from the saved target state."} · client analysis only</p>
      <p className="small">Recorded action: {result.preview.action.type.replaceAll("_", " ")} · saved parent v{result.preview.parentVersion} → target v{result.preview.nextState.version}</p>
      <dl className="record-details"><dt>Modeled containment before</dt><dd>{Math.round(result.preview.before.containmentCoverage * 100)}%</dd><dt>Recomputed containment after</dt><dd>{Math.round(result.preview.after.containmentCoverage * 100)}%</dd><dt>Changed assets</dt><dd>{result.preview.changedAssetIds.length}</dd><dt>Changed relationships</dt><dd>{result.preview.changedEdgeIds.length}</dd></dl>
      {!!result.mismatches.length && <ul>{result.mismatches.map((mismatch, index) => <li key={index}>{mismatch}</li>)}</ul>}
      <details className="small"><summary>Replay provenance</summary><p>Parent snapshot {result.parentSnapshotId}</p><p>Target snapshot {result.targetSnapshotId}</p><p>Recorded proposal {result.proposalId}</p><p>Saved digests are validated before recomputation. Matching demonstrates the recorded transition under the current deterministic rules; it does not establish real-world containment.</p></details>
    </>}
  </section>;
}
