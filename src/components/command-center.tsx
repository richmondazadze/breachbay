"use client";
import { EvidenceCitations } from "./decision-details";
import { DetailedTwin, type TwinView } from "./detailed-twin";
import { OperationalOverview } from "./operational-overview";
import { ThemeControl } from "./theme";
import { useInterfaceMotion } from "@/hooks/use-interface-motion";
import { useState } from "react";
import { motion, MotionConfig, AnimatePresence } from "motion/react";
import { ReactFlow, Background, Controls } from "@xyflow/react";
import { assets, graphNodes, graphEdges } from "./fixtures/synthetic-preview";
import "@xyflow/react/dist/style.css";
import {
  Shield,
  LayoutDashboard,
  Network,
  Search,
  FileText,
  MessagesSquare,
  ArrowUpRight,
  ChevronRight,
  Radio,
  CircleHelp,
  LockKeyhole,
  Check,
  Clock3,
  Activity,
  Server,
  Database,
  Laptop,
  X,
  Filter,
  AlertTriangle,
} from "./ui/icons";
import { Button } from "./ui/button";
const tabs = [
  ["overview", "Overview", LayoutDashboard],
  ["twin", "Response Twin", Network],
  ["investigation", "Investigation", Search],
  ["evidence", "Evidence", FileText],
  ["warroom", "War Room", MessagesSquare],
] as const;
export function CommandCenter() {
  const [page, setPage] = useState<"mission" | "incident">("incident");
  const [tab, setTab] = useState("overview");
  const uiMotion = useInterfaceMotion();
  const [selected, setSelected] = useState<string | null>(null);
  const [twinView,setTwinView] = useState<TwinView>({positions:{},pinned:[]});
  const [listView, setListView] = useState(false);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const open = (next = "overview") => {
    setPage("incident");
    setTab(next);
    setSelected(null);
  };
  const unavailable = () =>
    setNotice(
      "This is a synthetic preview. Connect an authenticated backend to perform this operation.",
    );
  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        <aside className="sidebar">
          <a className="brand" href="/" aria-label="BreachBay home">
            <img
              className="harbor-mark"
              src="/brand/harbor.svg"
              width="32"
              height="32"
              alt=""
            />
            BreachBay<span className="brand-period">.</span>
          </a>
          <div className="workspace-label">HACKUTD RESPONSE TEAM</div>
          <nav aria-label="Main navigation">
            <button
              className={page === "mission" ? "nav-item active" : "nav-item"}
              onClick={() => setPage("mission")}
            >
              <LayoutDashboard size={18} />
              Mission Control
            </button>
            <button
              className={page === "incident" ? "nav-item active" : "nav-item"}
              onClick={() => open()}
            >
              <Radio size={18} />
              Incident workspace<span className="count">1</span>
            </button>
          </nav>
          <nav className="rail-sections" aria-label="Incident shortcuts">
            {tabs.map(([id, label, Icon]) => (
              <button
                key={id}
                title={label}
                aria-label={label}
                className={
                  tab === id && page === "incident"
                    ? "rail-button active"
                    : "rail-button"
                }
                onClick={() => open(id)}
              >
                <Icon size={19} />
              </button>
            ))}
          </nav>{" "}
          <div className="sidebar-section">ACTIVE INCIDENT</div>
          <button className="incident-nav" onClick={() => open()}>
            <span className="severity-dot" />
            <span>
              Credential compromise<small>BB-2026-014 · SEV 1</small>
            </span>
          </button>
          <div className="sidebar-bottom">
            <div className="independent">
              <Radio size={16} />
              <span>
                Independent command<small>Synthetic environment</small>
              </span>
            </div>
            <button
              className="nav-item"
              onClick={() =>
                setNotice(
                  "Preview guide: inspect the response graph, review evidence, then inspect the simulation proposal. Operational changes require a connected backend.",
                )
              }
            >
              <CircleHelp size={18} />
              Help & guidance
            </button>
            <div className="profile">
              <span className="avatar">PV</span>
              <div>
                Preview visitor<small>Read-only · no session</small>
              </div>
              <LockKeyhole size={15} />
            </div>
          </div>
        </aside>
        <main id="main-content">
          <a className="skip-link" href="#content">
            Skip to content
          </a>
          <header className="topbar">
            <div className="breadcrumbs">
              Command center
              <ChevronRight size={14} />
              <span>
                {page === "mission" ? "Mission Control" : "BB-2026-014"}
              </span>
            </div>
            <div className="topbar-right">
              <ThemeControl />
              <a className="text-button responder-sign-in" href="/sign-in">
                Responder sign in
              </a>
              <span className="preview-badge">SYNTHETIC PREVIEW</span>
              <span className="connection">
                <span />
                Backend not connected
              </span>
            </div>
          </header>
          <div className="demo-banner">
            <AlertTriangle size={15} />
            <span>
              Demonstration data. No live incident, model run, or response
              execution is connected.
            </span>
          </div>
          <div id="content" className="content">
            {page === "mission" ? (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">OPERATIONAL OVERVIEW</div>
                    <h1>Mission Control</h1>
                    <p>A shared picture. A clear next move.</p>
                  </div>
                  <Button variant="outline" onClick={unavailable}>
                    Create incident <ArrowUpRight size={16} />
                  </Button>
                </div>
                <div className="metrics">
                  <Metric
                    label="Active incidents"
                    value="01"
                    detail="1 critical incident"
                    tone="orange"
                  />
                  <Metric
                    label="Pending decisions"
                    value="01"
                    detail="Commander review needed"
                    tone="orange"
                  />
                  <Metric
                    label="Open tasks"
                    value="03"
                    detail="2 assigned · 1 unassigned"
                  />
                  <Metric
                    label="Evidence collected"
                    value="04"
                    detail="Synthetic, redacted sources"
                  />
                </div>
                <div className="mission-grid">
                  <section className="panel incident-list">
                    <PanelTitle title="Active incidents" aside="01 incident" />
                    <div className="filter-row">
                      <label className="search-box">
                        <Search size={16} />
                        <input
                          aria-label="Search incidents"
                          placeholder="Search incidents…"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setFilter(filter === "all" ? "critical" : "all")
                        }
                      >
                        <Filter size={15} />
                        {filter === "all" ? "All severities" : "Critical only"}
                      </Button>
                    </div>
                    {"credential compromise".includes(query.toLowerCase()) ? (
                      <button className="incident-card" onClick={() => open()}>
                        <div className="incident-card-top">
                          <span className="severity-chip">
                            SEV 1 · CRITICAL
                          </span>
                          <span className="muted">
                            BB-2026-014 <ArrowUpRight size={16} />
                          </span>
                        </div>
                        <h2>Credential compromise & lateral movement</h2>
                        <p>
                          Workstation activity suggests a path toward the
                          customer database.
                        </p>
                        <div className="incident-card-bottom">
                          <span className="state-chip">Investigating</span>
                          <span>
                            <span className="avatar tiny">AR</span>Alex Rivera
                          </span>
                          <span className="muted">6 assets in scope</span>
                        </div>
                      </button>
                    ) : (
                      <div className="empty">
                        No incidents match your search.
                      </div>
                    )}
                    <div className="panel-foot">
                      <FileText size={14} />
                      Preview records only. Live access will be incident scoped.
                    </div>
                  </section>
                  <section className="panel decision-panel">
                    <PanelTitle title="Decision queue" aside="01 pending" />
                    <div className="decision-body">
                      <span className="eyebrow orange">
                        HUMAN REVIEW REQUIRED
                      </span>
                      <h2>Isolate APP-02</h2>
                      <p>
                        Interrupt the observed spread path before it reaches
                        DB-01.
                      </p>
                      <div className="impact-warning">
                        <AlertTriangle size={17} />
                        <span>
                          Customer portal may be disrupted.
                          <small>
                            Alternate identity path remains unresolved.
                          </small>
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => open("overview")}
                      >
                        Review simulation <ArrowUpRight size={16} />
                      </Button>
                    </div>
                  </section>
                  <section className="panel">
                    <PanelTitle
                      title="Recent activity"
                      aside="Synthetic timeline"
                    />
                    <Timeline />
                  </section>
                  <section className="panel">
                    <PanelTitle
                      title="Command continuity"
                      aside={<Activity size={16} />}
                    />
                    <div className="health-list">
                      {[
                        ["Command state", "Not connected"],
                        ["Independent identity", "Not configured"],
                        ["Nemotron gateway", "Not verified"],
                        ["Simulator", "Preview only"],
                      ].map(([a, b]) => (
                        <div key={a}>
                          <span>{a}</span>
                          <span className="health-state">{b}</span>
                        </div>
                      ))}
                    </div>
                    <div className="panel-foot">
                      Manual workflows require a live backend connection.
                    </div>
                  </section>
                </div>
              </>
            ) : (
              <>
                <div className="page-heading incident-heading">
                  <div>
                    <div className="eyebrow">
                      BB-2026-014{" "}
                      <span className="severity-chip">SEV 1 · CRITICAL</span>
                    </div>
                    <h1>Credential compromise</h1>
                    <p>Lateral movement toward a critical customer database.</p>
                  </div>
                  <div className="incident-owner">
                    <span className="state-chip">Investigating</span>
                    <span className="avatar">AR</span>
                    <div>
                      Alex Rivera<small>Incident commander · fixture</small>
                    </div>
                  </div>
                </div>
                <nav className="tabs" aria-label="Incident sections">
                  {tabs.map(([id, label, Icon]) => (
                    <button
                      key={id}
                      aria-current={tab === id ? "page" : undefined}
                      className={tab === id ? "selected" : ""}
                      onClick={() => {
                        setTab(id);
                        setSelected(null);
                      }}
                    >
                      <Icon size={16} />
                      {label}
                      {id === "evidence" && <span>4</span>}
                    </button>
                  ))}
                </nav>
                <motion.div
                  key={tab}
                  initial={
                    uiMotion.instant
                      ? false
                      : { opacity: 0, transform: "translateY(4px)" }
                  }
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  transition={{
                    duration: uiMotion.duration,
                    ease: [0.23, 1, 0.32, 1],
                  }}
                >
                  {tab === "overview" ? (
                    <OperationalOverview
                      nodes={graphNodes}
                      edges={graphEdges}
                      assets={assets.map((a) => ({
                        id: a.id,
                        name: a.label,
                        state: a.status,
                      }))}
                      evidence={[
                        {
                          id: "E-001",
                          title: "Workstation connections",
                          source: "Synthetic JSON",
                        },
                        {
                          id: "E-002",
                          title: "Application authentication",
                          source: "Synthetic JSON",
                        },
                        {
                          id: "E-003",
                          title: "Service dependencies",
                          source: "Synthetic inventory",
                        },
                        {
                          id: "E-004",
                          title: "Initial responder report",
                          source: "Synthetic report",
                        },
                      ]}
                      assessment="Observed workstation activity suggests a path toward the customer database. Identity-service involvement remains unverified."
                      investigationStatus="Not connected"
                      synthetic
                      onInspect={setSelected}
                      onNavigate={setTab}
                      decisions={
                        <div className="decision-body compact-decision">
                          <span className="state-chip">Preview only</span>
                          <h2>Isolate APP-02</h2>
                          <p>
                            Interrupt the observed spread path. Customer portal
                            service may be disrupted.
                          </p>
                          <EvidenceCitations
                            ids={["E-001", "E-002"]}
                            evidence={[{ id: "E-001", title: "Workstation connections" }, { id: "E-002", title: "Application authentication" }]}
                            onInspect={setSelected}
                          />
                          <div className="diff">
                            <div>
                              <span>Spread path</span>
                              <strong className="teal">Interrupted</strong>
                            </div>
                            <div>
                              <span>Customer portal</span>
                              <strong className="orange">Disrupted</strong>
                            </div>
                            <div>
                              <span>Identity route</span>
                              <strong>Unresolved</strong>
                            </div>
                          </div>
                          <div className="approval-record">
                            <div>
                              <span>Scenario version</span>
                              <code>7 · synthetic</code>
                            </div>
                            <div>
                              <span>Approver</span>
                              <span>No authenticated actor</span>
                            </div>
                            <div>
                              <span>Audit status</span>
                              <span>No server record</span>
                            </div>
                          </div>
                          <Button disabled>Approve simulation</Button>
                          <p className="small muted">
                            Connect an authenticated backend to review and
                            approve.
                          </p>
                        </div>
                      }
                      timeline={<Timeline />}
                    />
                  ) : tab === "twin" ? (
                    <section className="panel graph-panel">
                      <PanelTitle
                        title="Synthetic Response Twin"
                        aside={
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setListView(!listView)}
                          >
                            {listView ? "Graph view" : "Accessible list"}
                          </Button>
                        }
                      />
                      <div className="graph-legend">
                        <span>
                          <i className="legend-line" />
                          Evidence-backed
                        </span>
                        <span>
                          <i className="legend-line dashed" />
                          Hypothesis
                        </span>
                        <span className="muted">
                          Select a node to inspect provenance
                        </span>
                      </div>
                      {listView ? (
                        <div className="asset-list">
                          {assets.map((a) => (
                            <button
                              key={a.id}
                              onClick={() => setSelected(a.id)}
                            >
                              <Server size={18} />
                              <strong>{a.label}</strong>
                              <span>{a.detail}</span>
                              <span className="state-chip">{a.status}</span>
                              <ChevronRight size={16} />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <DetailedTwin nodes={graphNodes} edges={graphEdges} view={twinView} setView={setTwinView} onInspect={setSelected} />
                      )}
                      <div className="panel-foot">
                        Synthetic scenario v7 · No live asset state · Dashed
                        links are unsupported hypotheses
                      </div>
                    </section>
                  ) : tab === "investigation" ? (
                    <section className="panel">
                      <PanelTitle
                        title="Investigation Studio"
                        aside={
                          <span className="state-chip">Example trace</span>
                        }
                      />
                      <div className="studio-grid">
                        <div className="trace">
                          <div className="eyebrow">
                            SYNTHETIC INVESTIGATION EXAMPLE
                          </div>
                          <h2>Determine the scope of lateral movement</h2>
                          <p className="muted">
                            This trace illustrates the intended workflow. No
                            model has run.
                          </p>
                          {[
                            [
                              "search_evidence",
                              "Two redacted log excerpts",
                              "E-001, E-002",
                            ],
                            [
                              "correlate_indicators",
                              "WS-014 credential reuse on APP-02",
                              "E-002",
                            ],
                            [
                              "calculate_impact",
                              "Customer portal depends on APP-02",
                              "E-003",
                            ],
                          ].map(([tool, result, refs], i) => (
                            <div className="trace-step" key={tool}>
                              <span className="step-number">0{i + 1}</span>
                              <div>
                                <code>{tool}</code>
                                <p>{result}</p>
                                <button
                                  className="text-button"
                                  onClick={() => {
                                    setTab("evidence");
                                    setSelected("evidence");
                                  }}
                                >
                                  {refs} <ArrowUpRight size={12} />
                                </button>
                              </div>
                              <span className="muted small">Fixture</span>
                            </div>
                          ))}
                          <Button disabled>Start investigation</Button>
                          <p className="small muted">
                            Requires authenticated gateway and confirmed
                            provider availability.
                          </p>
                        </div>
                        <div className="findings">
                          <span className="eyebrow">EXAMPLE FINDING</span>
                          <h2>Observed route to DB-01</h2>
                          <p>
                            Connection logs support WS-014 → APP-02 → DB-01.
                            They do not establish successful database
                            exfiltration.
                          </p>
                          <span className="state-chip">
                            Supported by E-001 / E-002
                          </span>
                          <h3>Unknowns</h3>
                          <p>
                            Identity-service exposure and database access
                            outcome require additional evidence.
                          </p>
                          <Button
                            variant="outline"
                            onClick={() => setTab("twin")}
                          >
                            Inspect affected assets <ArrowUpRight size={16} />
                          </Button>
                        </div>
                      </div>
                    </section>
                  ) : tab === "evidence" ? (
                    <section className="panel">
                      <PanelTitle
                        title="Evidence register"
                        aside="4 synthetic sources"
                      />
                      <div
                        className="evidence-table"
                        role="table"
                        aria-label="Synthetic evidence"
                      >
                        <div className="table-header" role="row">
                          <span>Evidence / source</span>
                          <span>Classification</span>
                          <span>Capture time</span>
                          <span>Provenance</span>
                        </div>
                        {[
                          [
                            "E-001",
                            "Workstation connection log",
                            "Synthetic JSON",
                            "18:03 UTC",
                          ],
                          [
                            "E-002",
                            "Application authentication log",
                            "Synthetic JSON",
                            "18:05 UTC",
                          ],
                          [
                            "E-003",
                            "Service dependency inventory",
                            "Synthetic inventory",
                            "17:40 UTC",
                          ],
                          [
                            "E-004",
                            "Responder initial report",
                            "Synthetic report",
                            "18:08 UTC",
                          ],
                        ].map(([id, title, source, time]) => (
                          <button
                            role="row"
                            key={id}
                            onClick={() => setSelected(id)}
                          >
                            <span>
                              <strong>{title}</strong>
                              <small>
                                {id} · {source}
                              </small>
                            </span>
                            <span className="state-chip">Redacted preview</span>
                            <span>{time}</span>
                            <span>
                              Fixture <ChevronRight size={14} />
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="panel-foot">
                        <FileText size={14} />
                        Raw evidence is unavailable in preview. Hashes and
                        integrity must be verified at ingestion.
                      </div>
                    </section>
                  ) : (
                    <div className="warroom-grid">
                      <section className="panel">
                        <PanelTitle
                          title="Incident war room"
                          aside="No live presence"
                        />
                        <div className="chat">
                          <div className="chat-message">
                            <span className="avatar">AR</span>
                            <div>
                              <strong>
                                Alex Rivera <small>18:10 UTC · fixture</small>
                              </strong>
                              <p>
                                Review the APP-02 simulation before approving.
                                We need to understand customer portal impact.
                              </p>
                            </div>
                          </div>
                          <div className="chat-message">
                            <span className="avatar alternate">JL</span>
                            <div>
                              <strong>
                                Jordan Lee <small>18:12 UTC · fixture</small>
                              </strong>
                              <p>
                                Connection evidence is linked. The identity
                                route still needs investigation.
                              </p>
                            </div>
                          </div>
                          <div className="chat-date">
                            End of synthetic conversation
                          </div>
                          <label className="field-label">
                            Message
                            <textarea
                              disabled
                              placeholder="Connect to the incident to send messages"
                            />
                          </label>
                          <Button disabled>Send message</Button>
                        </div>
                      </section>
                      <section className="panel">
                        <PanelTitle
                          title="Assignments"
                          aside="Synthetic roster"
                        />
                        <Tasks />
                      </section>
                    </div>
                  )}
                </motion.div>
              </>
            )}
          </div>
          <footer>
            BreachBay <span>Independent incident command · breachbay.us</span>
            <span>All displayed records are synthetic</span>
          </footer>
        </main>
        <AnimatePresence>
          {selected && (
            <motion.aside
              key="provenance"
              className="detail-panel"
              aria-label="Selected item details"
              initial={
                uiMotion.instant
                  ? false
                  : { opacity: 0, transform: "translateX(24px)" }
              }
              animate={{ opacity: 1, transform: "translateX(0px)" }}
              exit={{
                opacity: 0,
                transform: uiMotion.instant
                  ? "translateX(0px)"
                  : "translateX(24px)",
              }}
              transition={{
                duration: uiMotion.duration,
                ease: [0.32, 0.72, 0, 1],
              }}
            >
              <div className="detail-top">
                <span className="eyebrow">PROVENANCE & SCOPE</span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Close details"
                  onClick={() => setSelected(null)}
                >
                  <X size={18} />
                </Button>
              </div>
              <Network size={28} className="teal" />
              <h2>
                {assets.find((a) => a.id === selected)?.label ?? selected}
              </h2>
              <p>
                {assets.find((a) => a.id === selected)?.detail ??
                  "Synthetic redacted evidence preview"}
              </p>
              <span className="preview-badge">SYNTHETIC RECORD</span>
              <h3>Supporting evidence</h3>
              <p>
                E-001 / E-002 describe observed communications. Service
                dependencies are sourced from E-003.
              </p>
              <h3>Uncertainty</h3>
              <p>
                Observed connections do not confirm exfiltration. Identity
                involvement remains unverified.
              </p>
              <h3>Action eligibility</h3>
              <p>
                No authenticated membership or server policy result is
                available.
              </p>
              <Button disabled>Propose response</Button>
              <Button
                variant="outline"
                onClick={() => {
                  setTab("evidence");
                  setSelected(null);
                }}
              >
                Open evidence register
              </Button>
            </motion.aside>
          )}
        </AnimatePresence>
        {notice && (
          <div className="notice" role="status">
            <CircleHelp size={18} />
            <span>{notice}</span>
            <button
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              <X size={18} />
            </button>
          </div>
        )}
      </div>
    </MotionConfig>
  );
}
function Metric({
  label,
  value,
  detail,
  tone = "",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small className={tone}>{detail}</small>
    </div>
  );
}
function PanelTitle({
  title,
  aside,
}: {
  title: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="panel-title">
      <h2>{title}</h2>
      <span>{aside}</span>
    </div>
  );
}
function Timeline() {
  return (
    <div className="timeline">
      {[
        [
          "18:12",
          "Response preview prepared",
          "APP-02 isolation · service impact identified",
          Network,
        ],
        [
          "18:08",
          "Investigation evidence linked",
          "E-001 and E-002 · observed communication",
          Search,
        ],
        [
          "18:03",
          "Incident opened",
          "Alex Rivera · credential compromise",
          Radio,
        ],
      ].map(([time, title, detail, Icon]) => {
        const I = Icon as typeof Radio;
        return (
          <div className="timeline-row" key={String(time)}>
            <time>{String(time)}</time>
            <span className="timeline-icon">
              <I size={15} />
            </span>
            <div>
              <strong>{String(title)}</strong>
              <small>{String(detail)}</small>
            </div>
          </div>
        );
      })}
      <div className="small muted timeline-note">
        Example chronology · no server audit records
      </div>
    </div>
  );
}
function Tasks() {
  return (
    <div className="tasks">
      {[
        ["Review portal disruption", "Alex Rivera", "Decision"],
        ["Investigate identity route", "Jordan Lee", "Investigation"],
        ["Confirm database access outcome", "Unassigned", "Evidence"],
      ].map(([title, owner, tag]) => (
        <div key={title}>
          <span className="task-circle" />
          <div>
            <strong>{title}</strong>
            <small>{owner}</small>
          </div>
          <span className="task-tag">{tag}</span>
        </div>
      ))}
    </div>
  );
}
