"use client";
import { EvidenceUpload, ProtectedDownloadControl } from "./evidence-transfers";
import { AuthenticationRecovery } from "./auth/authentication-recovery";
import { ResponsePlanning } from "./response-planning";
import { GraphRelationshipReview } from "./graph-relationship-review";
import { IncidentHeading } from "./incident-heading";
import { InvestigationTrace } from "./investigation-trace";
import { IncidentTimeline } from "./incident-timeline";
import { IncidentDetails } from "./incident-details";
import { IncidentRetention } from "./incident-retention";
import { sortAuditEvents } from "@/hooks/audit-presentation";
import { ScenarioHistory, CancelInvestigation } from "./scenario-history";
import { DetailedTwin, type TwinView } from "./detailed-twin";
import { IncidentLifecycle, ManualProposal, FindingReview, EvidenceRelationship, AcknowledgeControl } from "./incident-operations";
import { IncidentTeam } from "./incident-team";
import { AnimatePresence } from "motion/react";
import {
  LayoutDashboard,
  Network,
  Search,
  FileText,
  MessagesSquare,
} from "./ui/icons";
import { OperationalOverview } from "./operational-overview";
import { ConnectionStatus, IncidentLoading } from "./connection-status";
import {
  EvidenceCitations,
  ImpactPreview,
  ApprovalRecord,
  ResponseTargets,
} from "./decision-details";
import { useState, useRef, useEffect } from "react";
import {
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useIncident, type IncidentClient, type EvidenceUploadCommand } from "@/hooks/use-incident";
import { Button } from "./ui/button";
import type { Proposal, CommandMeta } from "@/lib/contracts";
/** The integration owner mounts this with the real authenticated client. No demo fallback. */
export function ConnectedIncident({
  incidentId,
  client,
}: {
  incidentId: string;
  client?: IncidentClient;
}) {
  const state = useIncident(incidentId, client);
  const [tab, setTab] = useState("overview");
  const [message, setMessage] = useState("");
  const [objective, setObjective] = useState("");
  const [reason, setReason] = useState("");
  const [twinView, setTwinView] = useState<TwinView>({positions:{},pinned:[]});
  const [evidenceQuery,setEvidenceQuery] = useState("");
  const [evidenceOrder,setEvidenceOrder] = useState("captured");
  const [selected, setSelected] = useState<string | null>(null);
  const uploadAttempt = useRef<EvidenceUploadCommand | null>(null);
  const reportAttempt = useRef<CommandMeta | null>(null);
  useEffect(() => {
    const clearTransfers = () => { uploadAttempt.current = null; reportAttempt.current = null; setTwinView({positions:{},pinned:[]}); setSelected(null); };
    window.addEventListener("breachbay-session-ending", clearTransfers);
    return () => { clearTransfers(); window.removeEventListener("breachbay-session-ending", clearTransfers); };
  }, [incidentId, client]);
  const s = state.snapshot;
  const meta = () => ({
    incidentId,
    idempotencyKey: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
  });
  const disabled = state.connection !== "live" || state.pending;
  const run = (
    p: Proposal,
    kind: "simulate" | "approve" | "reject" | "execute",
  ) => {
    if (!client || !s) return;
    const common = {
      ...meta(),
      proposalId: p.id,
      expectedVersion: s.incident.scenarioVersion,
    };
    void state.command(() =>
      kind === "simulate"
        ? client.simulateAction(common)
        : kind === "execute"
          ? client.executeSimulation(common)
          : client.approveAction({
              ...common,
              proposalVersion: p.version,
              decision: kind === "approve" ? "APPROVE" : "REJECT",
              justification: reason,
            }),
    );
  };
  if (!s)
    return (
      <main className="connected-main">
        <a href="/" className="text-button">
          ← Mission Control preview
        </a>
        <div className="page-heading">
          <div>
            <div className="eyebrow">LIVE INCIDENT WORKSPACE</div>
            <h1>
              {state.connection === "connecting"
                ? "Connecting…"
                : "Connection required"}
            </h1>
            <p>
              {state.error ??
                "No authenticated backend adapter is configured. Synthetic records are available separately in the preview."}
            </p>
          </div>
        </div>
        <ConnectionStatus state={state.connection} />
        <AuthenticationRecovery error={state.authenticationError} />
        {state.connection === "connecting" && <IncidentLoading />}
        <div className="empty-state">
          <h2>No incident state available</h2>
          <p>
            Incident {incidentId}. Access requires an independently
            authenticated session and a server-authorized subscription.
          </p>
        </div>
      </main>
    );
  const nodes: Node[] = s.assets.map((a, i) => ({
    id: a.id,
    ariaLabel: `${a.name} · ${a.type} · ${a.state} · ${a.criticality} criticality`,
    position: { x: (i % 3) * 230, y: Math.floor(i / 3) * 150 },
    data: {
      label: (
        <div className="graph-node">
          <strong>{a.name}</strong>
          <small>
            {a.type} · {a.criticality}
          </small>
          <span>{a.state}</span>
        </div>
      ),
    },
    style: { width: 180 },
  }));
  const edges: Edge[] = s.edges
    .filter((e) => e.enabled)
    .map((e) => ({
      id: e.id,
      source: e.fromId,
      target: e.toId,
      label: e.type,
      style: {
        stroke: e.verificationStatus === "VERIFIED" ? "#27d6b0" : "#b7a181",
        strokeDasharray:
          e.verificationStatus === "VERIFIED" ? undefined : "5 5",
      },
      labelStyle: { fill: "var(--graph-label)" },
      labelBgStyle: { fill: "var(--panel)" },
    }));
  const linkedIds = new Set(s.edges.filter(e=>e.enabled).flatMap(e=>[e.fromId,e.toId]));
  const relatedNodes: Node[] = [
    ...s.evidence.filter(e=>linkedIds.has(e.id)).map(e=>({id:e.id,name:e.title,kind:"Evidence"})),
    ...s.indicators.filter(i=>linkedIds.has(i.id)).map(i=>({id:i.id,name:`${i.kind} ${i.normalizedValue}`,kind:"Indicator"})),
    ...s.proposals.filter(p=>linkedIds.has(p.id)).map(p=>({id:p.id,name:p.action.type,kind:"Proposal"})),
  ].map((n,i)=>({id:n.id,position:{x:(i%3)*230,y:(Math.ceil(s.assets.length/3)+Math.floor(i/3))*150},ariaLabel:`${n.kind} · ${n.name}`,data:{label:<div className="graph-node"><strong>{n.name}</strong><small>{n.kind}</small></div>},style:{width:180}}));
  const latestInvestigation = [...s.investigations].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id)).at(-1);
  const latestSimulation = [...s.simulations].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id)).at(-1);
  return (
    <main className="connected-main live-command">
      <aside className="live-rail">
        <a href="/command" aria-label="BreachBay Mission Control">
          <img src="/brand/harbor.svg" alt="" width="32" height="32" />
        </a>
        <nav aria-label="Incident navigation">
          {[
            ["overview", "Overview", LayoutDashboard],
            ["graph", "Response topology", Network],
            ["investigation", "Investigation", Search],
            ["evidence", "Evidence", FileText],
            ["collaboration", "War room", MessagesSquare],
          ].map(([id, label, Icon]) => {
            const I = Icon as typeof Network;
            return (
              <button
                key={String(id)}
                className={tab === id ? "rail-button active" : "rail-button"}
                aria-label={String(label)}
                aria-current={tab === id ? "page" : undefined}
                title={String(label)}
                onClick={() => setTab(String(id))}
              >
                <I size={19} />
              </button>
            );
          })}
        </nav>
      </aside>
      <a href="/" className="text-button">
        ← Mission Control preview
      </a>
      <ConnectionStatus state={state.connection} />
      <IncidentHeading incident={s.incident} actions={client ? <ProtectedDownloadControl client={client} incidentId={incidentId} reportAttempt={reportAttempt} disabled={disabled || !state.capabilities.includes("EXPORT")} /> : undefined} />
      {client && <IncidentLifecycle snapshot={s} client={client} disabled={disabled} canManage={state.capabilities.includes("MANAGE_INCIDENT")} command={state.command} />}
      {client && <IncidentRetention key={incidentId} snapshot={s} userId={state.session?.user.id} client={client} disabled={disabled} command={state.command} />}
      <nav className="tabs" aria-label="Incident sections">
        {[
          "overview",
          "graph",
          "investigation",
          "evidence",
          "collaboration",
        ].map((t) => (
          <button
            className={tab === t ? "selected" : ""}
            aria-current={tab === t ? "page" : undefined}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>
      {state.error && (
        <div className="impact-warning" role="alert">
          {state.error}
        </div>
      )}
      {state.receipt && (
        <p role="status" className="teal command-receipt">
          {state.receipt}
        </p>
      )}
      <AuthenticationRecovery error={state.authenticationError} />
      {tab === "overview" && (
        <>
          <OperationalOverview
            nodes={nodes}
            edges={edges}
            containmentCoverage={latestSimulation?.diff.containmentCoverage}
            assets={s.assets.map((a) => ({
              id: a.id,
              name: a.name,
              state: a.state,
            }))}
            evidence={s.evidence}
            investigationStatus={
              latestInvestigation?.status ?? "No runs requested"
            }
            assessment={s.incident.description}
            onInspect={setSelected}
            onNavigate={(t) => setTab(t === "twin" ? "graph" : t)}
            decisions={
              <div className="decision-body compact-decision">
                {s.proposals.length ? (
                  s.proposals.map((p) => (
                    <div key={p.id}>
                      <span className="state-chip">{p.status}</span>
                      <h2>{p.action.type.replaceAll("_", " ")}</h2>
                      <p>{p.rationale}</p>
                      <a
                        href="#approval-review"
                        className="button button-outline"
                      >
                        Review decision →
                      </a>
                    </div>
                  ))
                ) : (
                  <p>No response proposals.</p>
                )}
              </div>
            }
            timeline={
              <div className="timeline">
                {sortAuditEvents(s.auditEvents).slice(-4).map((e) => (
                  <div key={e.id} className="chronology-event">
                    <strong>{e.verb}</strong>
                    <small><time dateTime={e.createdAt}>{e.createdAt}</time></small>
                    <p>{e.detail}</p>
                  </div>
                ))}
                <a className="text-button" href="#server-audit-timeline">Filter the server audit timeline →</a>
              </div>
            }
          />
          {client && <ManualProposal snapshot={s} client={client} disabled={disabled} canPropose={state.capabilities.includes("PROPOSE") && s.memberships.some(m=>m.active && m.userId===state.session?.user.id && m.role!=="AI_SERVICE")} command={state.command} />}
          <div id="approval-review" className="incident-grid approval-review">
            <section className="panel">
              <div className="panel-title">
                <h2>Response decisions</h2>
                <span>Scenario v{s.incident.scenarioVersion}</span>
              </div>
              {!s.proposals.length && (
                <p className="empty">No response proposals.</p>
              )}
              {s.proposals.map((p) => {
                const simulation = s.simulations.find(
                  (b) => b.id === p.simulationId,
                );
                const approval = s.approvals.filter(a=>a.proposalId===p.id && a.decision==="APPROVE").sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)).at(-1);
                const applicableApproval = approval?.payloadDigest===p.payloadDigest && approval?.proposalVersion===p.version && approval?.scenarioVersion===s.incident.scenarioVersion && approval?.approverId!==p.requestedBy;
                const stale = p.expectedVersion !== s.incident.scenarioVersion;
                const completed = ["VERIFIED_SUCCESS", "VERIFIED_PARTIAL", "VERIFIED_FAILED"].includes(p.status);
                return (
                  <article className="decision-body approval-card" key={p.id}>
                    <h2>{p.action.type.replaceAll("_", " ")}</h2>
                    <p>{p.rationale}</p>
                    <span className="state-chip">{p.status}</span>
                    <ResponseTargets action={p.action} incidentId={incidentId} assets={s.assets} edges={s.edges} />
                    {client && <AcknowledgeControl snapshot={s} objectId={p.id} userId={state.session?.user.id} client={client} disabled={disabled || !state.capabilities.includes("COLLABORATE")} command={state.command} />}
                    {!completed && p.requestedBy === state.session?.user.id && <p className="impact-warning">You requested this proposal. Another authorized human must approve it; ask an assigned investigator or commander to participate.</p>}
                    <EvidenceCitations
                      ids={p.evidenceIds}
                      evidence={s.evidence}
                      onInspect={setSelected}
                    />
                    <ApprovalRecord
                      proposal={p}
                      approval={approval}
                      audit={s.auditEvents}
                      memberships={s.memberships}
                    />
                    {simulation && (
                      <ImpactPreview branch={simulation} assets={s.assets} edges={s.edges} historical={completed} />
                    )}
                    {p.uncertainty.map((u) => (
                      <p key={u}>Uncertainty: {u}</p>
                    ))}
                    {p.assumptions.map((assumption,index)=><p key={index}>Assumption: {assumption}</p>)}
                    <ResponsePlanning plan={p.planning} assets={s.assets} edges={s.edges} incidentId={incidentId} version={p.expectedVersion} />
                    {stale && ["PENDING_APPROVAL", "APPROVED"].includes(p.status) && (
                      <p className="orange">
                        Scenario changed. Resimulation and approval required.
                      </p>
                    )}
                    <label className="field-label">
                      Decision justification
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                    <div className="button-row">
                      <Button
                        variant="outline"
                        disabled={disabled || !state.capabilities.includes("SIMULATE") || !["VALIDATED","PENDING_APPROVAL","APPROVED","REJECTED"].includes(p.status)}
                        onClick={() => run(p, "simulate")}
                      >
                        Simulate
                      </Button>
                      <Button
                        disabled={
                          disabled ||
                          !state.capabilities.includes("APPROVE") ||
                          p.requestedBy === state.session?.user.id ||
                          stale ||
                          p.status !== "PENDING_APPROVAL" ||
                          !reason.trim()
                        }
                        onClick={() => run(p, "approve")}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        disabled={
                          disabled ||
                          !state.capabilities.includes("APPROVE") ||
                          p.status !== "PENDING_APPROVAL" ||
                          !reason.trim()
                        }
                        onClick={() => run(p, "reject")}
                      >
                        Reject
                      </Button>
                    </div>
                    <Button
                      variant="outline"
                      disabled={
                        disabled ||
                        !state.capabilities.includes("EXECUTE_SIMULATION") ||
                        p.status !== "APPROVED" ||
                        stale ||
                        !approval ||
                        !applicableApproval ||
                        Date.parse(approval.expiresAt) <= Date.now()
                      }
                      onClick={() => run(p, "execute")}
                    >
                      Execute in simulator
                    </Button>
                    {s.verifications
                      .filter((v) => v.proposalId === p.id)
                      .map((v) => (
                        <p
                          className={
                            v.status === "VERIFIED_SUCCESS" ? "teal" : "orange"
                          }
                          key={v.id}
                        >
                          {v.status}: {v.summary} · execution observed scenario v
                          {v.observedVersion}
                        </p>
                      ))}
                  </article>
                );
              })}
            </section>
            <IncidentTimeline key={incidentId} snapshot={s} onInspect={setSelected} />
          </div>
        </>
      )}
      {client && (tab === "graph" || tab === "overview") && <ScenarioHistory snapshot={s} client={client} disabled={disabled} canRead={state.capabilities.includes("SIMULATE") && s.memberships.some(m=>m.active && m.userId===state.session?.user.id && m.role!=="AI_SERVICE")} canRestore={state.capabilities.includes("RESTORE_SIMULATION")} command={state.command} />}
      {tab === "graph" && (
        <section className="panel">
          <DetailedTwin nodes={[...nodes,...relatedNodes]} edges={edges} view={twinView} setView={setTwinView} onInspect={setSelected} />
          <div className="panel-foot">
            Dashed edges are unverified. Scenario version{" "}
            {s.incident.scenarioVersion}.
          </div>
        </section>
      )}
      {client && (tab === "evidence" || tab === "graph") && <EvidenceRelationship snapshot={s} client={client} disabled={disabled} canAttach={state.capabilities.includes("ATTACH_EVIDENCE")} command={state.command} />}
      {client && (tab === "evidence" || tab === "graph") && <GraphRelationshipReview snapshot={s} client={client} userId={state.session?.user.id} canManage={state.capabilities.includes("MANAGE_INCIDENT")} disabled={disabled} command={state.command} onInspect={setSelected} />}
      {client && <EvidenceUpload attempt={uploadAttempt} incidentId={incidentId} client={client} hidden={tab !== "evidence"} disabled={disabled || !state.capabilities.includes("ATTACH_EVIDENCE")} command={state.command} />}
      {tab === "evidence" && (
        <section className="panel">
          <div className="asset-list">
            <div className="workflow-row"><label className="field-label">Filter evidence<input value={evidenceQuery} onChange={e=>setEvidenceQuery(e.target.value)} /></label><label className="field-label">Timeline order<select value={evidenceOrder} onChange={e=>setEvidenceOrder(e.target.value)}><option value="captured">Capture time</option><option value="attached">Attachment time</option></select></label></div>
            {s.evidence.filter(e=>`${e.title} ${e.source}`.toLowerCase().includes(evidenceQuery.toLowerCase())).sort((a,b)=>(evidenceOrder==="captured"?b.capturedAt:b.createdAt).localeCompare(evidenceOrder==="captured"?a.capturedAt:a.createdAt)).map((e) => (
              <button key={e.id} onClick={() => setSelected(e.id)}>
                {e.title} · {e.classification} · {e.source}<small>Captured {e.capturedAt} · attached {e.createdAt}</small>
              </button>
            ))}
          </div>
          {!s.evidence.length && <p className="empty">No evidence attached.</p>}
        </section>
      )}
      {tab === "investigation" && (
        <section className="panel decision-body">
          <h2>Investigation Studio</h2>
          {!["INVESTIGATING", "CONTAINMENT_PENDING", "CONTAINING"].includes(s.incident.status) && (
            <p className="impact-warning">
              Response proposals require INVESTIGATING, CONTAINMENT_PENDING or CONTAINING.
              Ask a commander to advance through Incident lifecycle to INVESTIGATING before requesting proposals.
              Evidence investigation remains available.
            </p>
          )}
          <label className="field-label">
            Bounded objective
            <textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
            />
          </label>
          <Button
            disabled={
              disabled ||
              state.investigationPending ||
              !objective.trim() ||
              !state.capabilities.includes("INVESTIGATE")
            }
            onClick={() => {
              if (client)
                void state.investigationCommand(() =>
                  client.startInvestigation({ ...meta(), objective }),
                );
            }}
          >
            Start investigation
          </Button>
          {state.investigationPending && <p className="small" role="status">Investigation request in progress. Server-recorded runs show its status; cancellation and collaboration remain available.</p>}
          {state.investigationError && <p className="impact-warning" role="alert">{state.investigationError}</p>}
          <AuthenticationRecovery error={state.investigationAuthenticationError} />
          {s.investigations.map((i) => (
            <div className="trace-step" key={i.id}>
              <div>
                <h3>{i.objective}</h3>
                <p>
                  {i.status} · {i.provider ?? "Provider not yet confirmed"} /{" "}
                  {i.model ?? "Model not yet confirmed"}
                </p>
                {client && <CancelInvestigation run={i} client={client} disabled={disabled} allowed={state.capabilities.includes("INVESTIGATE") && s.memberships.some(m=>m.active && m.userId===state.session?.user.id && m.role!=="AI_SERVICE" && (i.requestedBy===m.userId || m.role==="COMMANDER"))} command={state.command} />}
                <InvestigationTrace events={(s.streamEvents ?? []).filter(event => event.runId === i.id && event.incidentId === incidentId)} evidence={s.evidence} onInspect={setSelected} />
                <ResponsePlanning plan={i.planning} assets={s.assets} edges={s.edges} incidentId={incidentId} />
                {s.toolRuns
                  .filter((t) => t.investigationId === i.id)
                  .map((t) => (
                    <p key={t.id}>
                      <code>{t.tool}</code> · {t.status}{" "}
                      {t.durationMs !== undefined && `· ${t.durationMs}ms`}
                      <small>{t.summary}</small>
                    </p>
                  ))}
                {s.findings
                  .filter((f) => f.investigationId === i.id)
                  .map((f) => (
                    <div key={f.id}>
                      <h3>{f.title}</h3>
                      <p>{f.summary}</p>
                      <small>
                        {f.confidence} confidence · {f.verificationStatus}
                      </small>
                      <EvidenceCitations
                        ids={f.evidenceIds}
                        evidence={s.evidence}
                        onInspect={setSelected}
                      />
                      {client && <FindingReview finding={f} incidentId={incidentId} client={client} disabled={disabled} canManage={state.capabilities.includes("MANAGE_INCIDENT")} command={state.command} />}
                      {f.unknowns.map((u) => (
                        <p key={u}>Unknown: {u}</p>
                      ))}
                      {!!f.recommendedNextQueries?.length && <details><summary>Recommended next queries</summary>{f.recommendedNextQueries.map((query,index)=><p key={index}>{query}</p>)}</details>}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </section>
      )}
      {tab === "collaboration" && (
        <div className="warroom-grid">
          <section className="panel chat">
            <h2>War room</h2>
            {s.messages.map((m) => (
              <div className="chat-message" key={m.id}>
                <div>
                  <strong>{m.authorId}</strong>
                  <small>{m.createdAt}</small>
                  <p>{m.text}</p>
                  {client && <AcknowledgeControl snapshot={s} objectId={m.id} userId={state.session?.user.id} client={client} disabled={disabled || !state.capabilities.includes("COLLABORATE")} command={state.command} />}
                </div>
              </div>
            ))}
            <label className="field-label">
              Message
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>
            <Button
              disabled={
                disabled ||
                !message.trim() ||
                !state.capabilities.includes("COLLABORATE")
              }
              onClick={async () => {
                if (
                  client &&
                  (await state.command(() =>
                    client.postMessage({ ...meta(), text: message }),
                  ))
                )
                  setMessage("");
              }}
            >
              Send message
            </Button>
          </section>
          <section className="panel decision-body">
            <h2>Assignments</h2>
            {s.tasks.map((t) => (
              <p key={t.id}>
                {t.title} · {t.state}
                <small>{t.assigneeId ?? "Unassigned"}</small>
              </p>
            ))}
            <h3>Recent presence</h3>
            {s.presence
              .filter((p) => Date.parse(p.expiresAt) > Date.now())
              .sort((a,b)=>Date.parse(b.lastSeen)-Date.parse(a.lastSeen))
              .filter((p,index,rows)=>rows.findIndex(row=>row.userId===p.userId)===index)
              .map((p) => (
                <p key={p.id}>
                  {p.userId}
                  <small>Seen {p.lastSeen}</small>
                </p>
              ))}
          </section>
        </div>
      )}
      <AnimatePresence>
        {tab === "collaboration" && client && (
          <IncidentTeam
            snapshot={s}
            userId={state.session?.user.id}
            client={client}
            disabled={disabled || !state.capabilities.includes("COLLABORATE")}
            canManage={state.capabilities.includes("MANAGE_MEMBERS")}
            command={state.command}
          />
        )}
        {selected && (
          <IncidentDetails key="detail" snapshot={s} selected={selected} client={client}
            downloadDisabled={disabled || !state.capabilities.includes("READ") || !s.memberships.some(m => m.active && m.userId === state.session?.user.id && m.role !== "AI_SERVICE")}
            onInspect={setSelected} onDismiss={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </main>
  );
}
