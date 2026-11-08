import {
  ArrowRight,
  FileText,
  GitBranch,
  CheckCircle2,
  AlertTriangle,
} from "./ui/icons";
import type {
  SimulationBranch,
  Asset,
  Proposal,
  Approval,
  AuditEvent,
  GraphEdge,
  Evidence,
  ActionPayload,
  Membership,
  IncidentRole,
} from "@/lib/contracts";
export function EvidenceCitations({
  ids,
  evidence,
  onInspect,
}: {
  ids: string[];
  evidence: Pick<Evidence, "id" | "title">[];
  onInspect: (id: string) => void;
}) {
  return (
    <div className="citation-row" aria-label="Supporting evidence">
      {ids.length ? (
        ids.map((id) => {
          const title = evidence.find(item => item.id === id)?.title;
          const label = title?.trim() || `Evidence ${id.length > 24 ? `${id.slice(0, 10)}…${id.slice(-6)}` : id}`;
          return (
          <button
            className="citation-chip"
            key={id}
            onClick={() => onInspect(id)}
            aria-label={`Inspect provenance for evidence ${id}`}
            title={`${label} · ${id}`}
          >
            <FileText size={13} />
            <strong className="citation-label">{label}</strong>
            <span>Inspect</span>
          </button>
        ); })
      ) : (
        <span className="small muted">No supporting evidence cited</span>
      )}
    </div>
  );
}
export function ResponseTargets({ action, incidentId, assets, edges }: { action: Pick<ActionPayload, "type" | "targetIds">; incidentId: string; assets: Asset[]; edges: GraphEdge[] }) {
  const assetName = (id: string) => assets.find(asset => asset.incidentId === incidentId && asset.id === id)?.name;
  const label = (id: string) => {
    if (action.type !== "BLOCK_SIMULATED_ROUTE") return assetName(id) ?? "Asset name unavailable";
    const edge = edges.find(edge => edge.incidentId === incidentId && edge.id === id);
    return edge ? `${assetName(edge.fromId) ?? "Source asset unavailable"} → ${assetName(edge.toId) ?? "Destination asset unavailable"}` : "Path endpoints unavailable";
  };
  return <div className="response-targets">
    <p>Targets: {action.targetIds.map(label).join(", ")}</p>
    <details className="small decision-provenance"><summary>Target provenance</summary>{action.targetIds.map(id => <p key={id}><code>{id}</code></p>)}</details>
  </div>;
}
export function ImpactPreview({
  branch,
  assets,
  edges,
  historical = false,
}: {
  branch: SimulationBranch;
  assets: Asset[];
  edges: GraphEdge[];
  historical?: boolean;
}) {
  const name = (id: string) => assets.find((a) => a.id === id)?.name ?? id;
  return (
    <section className="impact-preview" aria-label="Containment impact preview">
      <header>
        <GitBranch size={16} />
        <h3>{historical ? "Historical containment preview" : "Containment preview"}</h3>
        <code>Scenario v{branch.parentVersion}</code>
      </header>
      <p className="small muted">
        {historical ? "Recorded synthetic prediction · execution verification is recorded separately." : "Synthetic prediction · execution has not been verified by this preview."}
      </p>
      <div className="impact-columns">
        <div>
          <h4>Before → after</h4>
          {branch.diff.assetChanges.map((c) => (
            <div className="impact-change" key={c.assetId}>
              <strong>{name(c.assetId)}</strong>
              <span>
                {c.before}
                <ArrowRight size={12} />
                {c.after}
              </span>
            </div>
          ))}
          {branch.diff.edgeChanges.map((c) => {
            const edge = edges.find(item => item.id === c.edgeId && item.incidentId === branch.incidentId);
            const source = edge && assets.find(asset => asset.id === edge.fromId && asset.incidentId === branch.incidentId);
            const destination = edge && assets.find(asset => asset.id === edge.toId && asset.incidentId === branch.incidentId);
            return <div className="impact-change" key={c.edgeId}>
              <strong>{edge ? `${source?.name ?? "Source asset unavailable"} → ${destination?.name ?? "Destination asset unavailable"}` : "Path endpoints unavailable"}</strong>
              <span>
                {c.before ? "Path enabled" : "Path disabled"}
                <ArrowRight size={12} />
                {c.after ? "Enabled" : "Disabled"}
              </span>
              <details className="small">
                <summary>Path provenance</summary>
                <code>{c.edgeId}</code>
                {edge && <p>{edge.type}<br /><code>{edge.fromId} → {edge.toId}</code></p>}
              </details>
            </div>;
          })}
        </div>
        <div>
          <h4>Service impact</h4>
          {branch.diff.disruptedServiceIds.length ? (
            branch.diff.disruptedServiceIds.map((id) => (
              <p className="impact-service" key={id}>
                <AlertTriangle size={13} />
                {name(id)} · disrupted
              </p>
            ))
          ) : (
            <p className="small">No disrupted services predicted</p>
          )}
          <h4>Remaining paths</h4>
          {branch.diff.unresolvedPaths.length ? (
            branch.diff.unresolvedPaths.map((path, i) => (
              <p className="path-text" key={i}>
                {path.map(name).join(" → ")}
              </p>
            ))
          ) : (
            <p className="small">No unresolved paths in this model</p>
          )}
        </div>
      </div>
      {branch.diff.warnings.map((w) => (
        <p className="impact-service" key={w}>
          <AlertTriangle size={13} />
          {w}
        </p>
      ))}
    </section>
  );
}
export function ApprovalRecord({
  proposal,
  approval,
  audit,
  memberships,
}: {
  proposal: Proposal;
  approval?: Approval;
  audit: AuditEvent[];
  memberships: Membership[];
}) {
  const events = audit.filter((e) => e.incidentId === proposal.incidentId && e.objectId === proposal.id);
  const completed = ["VERIFIED_SUCCESS", "VERIFIED_PARTIAL", "VERIFIED_FAILED"].includes(proposal.status);
  const roles: Record<IncidentRole, string> = { COMMANDER: "Commander", INVESTIGATOR: "Investigator", RESPONDER: "Responder", OBSERVER: "Observer", AI_SERVICE: "AI service" };
  const actorLabel = (id: string) => {
    const rows = memberships.filter(member => member.incidentId === proposal.incidentId && member.userId === id);
    const member = rows.find(member => member.active) ?? rows[0];
    return member ? `${roles[member.role]} · ${member.active ? "current role" : "inactive membership"}` : "Actor role unavailable";
  };
  return (
    <div className="approval-record" aria-label="Approval provenance">
      <div>
        <span>Requested by</span>
        <span>{actorLabel(proposal.requestedBy)}</span>
      </div>
      <div>
        <span>{completed ? "Historical proposal versions" : "Bound versions"}</span>
        <code>
          Scenario {proposal.expectedVersion} / proposal {proposal.version}
        </code>
      </div>
      <div>
        <span>Approving actor</span>
        <span>{approval ? actorLabel(approval.approverId) : "Awaiting authorized decision"}</span>
      </div>
      {approval && <div><span>Recorded approval versions</span><code>Scenario {approval.scenarioVersion} / proposal {approval.proposalVersion}{completed || approval.proposalVersion!==proposal.version || approval.scenarioVersion!==proposal.expectedVersion || approval.payloadDigest!==proposal.payloadDigest ? " · historical" : ""}</code></div>}
      <div>
        <span>Audit status</span>
        <span className={events.length ? "teal" : "muted"}>
          {events.length ? (
            <>
              <CheckCircle2 size={13} />
              Server record available
            </>
          ) : (
            "No server audit record available"
          )}
        </span>
      </div>
      <details className="small decision-provenance">
        <summary>Identity and audit provenance</summary>
        <p>Requester ID: <code>{proposal.requestedBy}</code></p>
        {approval && <p>Approver ID: <code>{approval.approverId}</code></p>}
        <p>Proposal payload SHA-256: <code>{proposal.payloadDigest}</code></p>
        {events.length > 0 && <p>Audit reference: <code>{events.at(-1)?.id}</code></p>}
      </details>
    </div>
  );
}
