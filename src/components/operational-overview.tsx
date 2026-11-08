"use client";
import { useRef, useState } from "react";
import { motion } from "motion/react";
import {
  ReactFlow,
  Background,
  Controls,
  Position,
  type Node,
  type Edge,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import { displayLabel } from "./ui/labels";
import { EvidenceCitations } from "./decision-details";
import { useInterfaceMotion } from "@/hooks/use-interface-motion";
import { Search, Network, ArrowUpRight, FileText } from "./ui/icons";
interface Props {
  nodes: Node[];
  edges: Edge[];
  assets: { id: string; name: string; state: string }[];
  evidence: { id: string; title: string; source: string }[];
  investigationStatus: string;
  assessment: string;
  decisions: React.ReactNode;
  timeline: React.ReactNode;
  onInspect: (id: string) => void;
  onNavigate: (tab: string) => void;
  synthetic?: boolean;
  containmentCoverage?: number;
  containmentVersion?: number;
}
export function OperationalOverview(p: Props) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [list, setList] = useState(false);
  const camera = useRef<Viewport | undefined>(undefined);
  const flow = useRef<ReactFlowInstance | null>(null);
  const { duration, instant } = useInterfaceMotion();
  const shown = p.assets.filter(
    (a) =>
      a.name.toLowerCase().includes(query.toLowerCase()) &&
      (scope === "all" || a.state.toLowerCase() !== "healthy"),
  );
  const ids = new Set(shown.map((a) => a.id));
  // Use the full supplied layout, not the filtered subset: scope changes and
  // status ticks retain the same coordinates and the user's camera.
  const rankCounts = new Map<number, number>();
  for (const node of p.nodes) rankCounts.set(node.position.x, (rankCounts.get(node.position.x) ?? 0) + 1);
  const ys = p.nodes.map(node => node.position.y);
  const centerY = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
  const nodes = p.nodes
    .filter((n) => ids.has(n.id))
    .map((n) => ({
      ...n,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      // Fixed projection: tighter horizontal ranks and separated branches fill
      // the overview without recalculating layout as live state changes.
      position: { x: n.position.x * 0.6, y: (rankCounts.get(n.position.x) === 1 ? centerY : n.position.y) * 1.2 },
      style: { ...n.style, width: 154 },
      data: {
        ...n.data,
        label: (
          <div className="graph-asset">
            <Network size={17} />
            <strong>{p.assets.find((a) => a.id === n.id)?.name ?? n.id}</strong>
          </div>
        ),
      },
    }));
  const edges = p.edges
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) => ({
      ...e,
      style: {
        ...e.style,
        stroke: e.style?.strokeDasharray ? "var(--amber)" : "var(--teal)",
      },
    }));
  return (
    <div className="operational-grid">
      <motion.aside
        className="ops-left"
        initial={instant ? false : { opacity: 0, transform: "translateY(6px)" }}
        animate={{ opacity: 1, transform: "translateY(0px)" }}
        transition={{ duration, ease: [0.23, 1, 0.32, 1] }}
      >
        <section className="panel scope-panel">
          <div className="panel-title">
            <h2>Incident scope</h2>
            <span className="state-chip">
              {p.synthetic ? "Synthetic" : "Scoped"}
            </span>
          </div>
          <div className="scope-summary">
            <strong>
              Incident at a glance
            </strong>
            <p>{p.assessment}</p>
            <dl>
              <div>
                <dt>Assets in scope</dt>
                <dd>{p.assets.length}</dd>
              </div>
              <div>
                <dt>Evidence sources</dt>
                <dd>{p.evidence.length}</dd>
              </div>
              <div>
                <dt>External AI</dt>
                <dd>{displayLabel(p.investigationStatus)}</dd>
              </div>
            </dl>
          </div>
        </section>
        <section className="panel evidence-stack">
          <div className="panel-title">
            <h2>Evidence sources</h2>
            <FileText size={16} />
          </div>
          {p.evidence.length ? (
            p.evidence.slice(0, 4).map((e) => (
              <div className="source-row" key={e.id}>
                <button
                  className="source-title"
                  onClick={() => p.onInspect(e.id)}
                >
                  {e.title}
                  <ArrowUpRight size={13} />
                </button>
                <span>{e.source}</span>
                <EvidenceCitations ids={[e.id]} evidence={p.evidence} onInspect={p.onInspect} />
              </div>
            ))
          ) : (
            <p className="empty">No evidence attached.</p>
          )}
          <button
            className="panel-link"
            onClick={() => p.onNavigate("evidence")}
          >
            Open evidence register →
          </button>
        </section>
        <section className="panel investigation-brief">
          <div className="panel-title">
            <h2>Investigation</h2>
            <Search size={16} />
          </div>
          <p data-status={p.investigationStatus}>{displayLabel(p.investigationStatus)}</p>
          <small>
            Findings require cited evidence. Unverified relationships remain
            hypotheses.
          </small>
          <button
            className="panel-link"
            onClick={() => p.onNavigate("investigation")}
          >
            Open investigation →
          </button>
        </section>
      </motion.aside>
      <motion.section
        className="ops-center"
        initial={instant ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration, ease: [0.23, 1, 0.32, 1] }}
      >
        <section className="panel topology-panel">
          <div className="panel-title">
            <div>
              <h2>Response topology</h2>
              <small>Evidence, dependencies and containment paths</small>
            </div>
            <Network size={18} />
          </div>
          <div className="topology-controls">
            <label className="search-box">
              <Search size={16} />
              <input
                aria-label="Search topology assets"
                placeholder="Find asset…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="Topology scope"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="all">All assets</option>
              <option value="risk">At risk / uncertain</option>
            </select>
            <div className="bb-segmented" aria-label="Topology view">{[false,true].map(isList=><button key={String(isList)} aria-pressed={list===isList} onClick={()=>setList(isList)}><span>{isList ? "List" : "Graph"}</span></button>)}</div>
            {!list && <button className="text-button" onClick={()=>void flow.current?.fitView({padding:0.14,maxZoom:1,duration:duration*1000})}>Fit diagram</button>}
          </div>
          <div className="graph-legend">
            <span>
              <i className="legend-line" />
              Evidence-backed
            </span>
            <span>
              <i className="legend-line dashed" />
              Hypothesis
            </span>
          </div>
          <motion.div key={list ? "list" : "graph"} initial={instant ? false : {opacity:0}} animate={{opacity:1}} transition={{duration,ease:[0.23,1,0.32,1]}}>{list ? (
            <div className="asset-list">
              {shown.map((a) => (
                <button key={a.id} onClick={() => p.onInspect(a.id)}>
                  <strong>{a.name}</strong>
                  <span className="state-chip" data-status={a.state}>{displayLabel(a.state)}</span>
                  <ArrowUpRight size={13} />
                </button>
              ))}
            </div>
          ) : (
            <div className="graph-canvas topology-canvas">
              {nodes.length ? (
                <ReactFlow<Node, Edge>
                  nodes={nodes}
                  edges={edges}
                  fitView={!camera.current}
                  defaultViewport={camera.current}
                  onInit={instance=>{flow.current=instance;}}
                  onMoveEnd={(_,viewport)=>{camera.current=viewport;}}
                  fitViewOptions={{ padding: 0.08, maxZoom: 1 }}
                  nodesConnectable={false}
                  nodesDraggable={false}
                  onNodeClick={(_, n) => p.onInspect(n.id)}
                >
                  <Background color="var(--graph-grid)" gap={26} />
                  <Controls showInteractive={false} showFitView={false} />
                </ReactFlow>
              ) : (
                <div className="empty">No assets match this scope.</div>
              )}
            </div>
          )}
          </motion.div>
          <div className="topology-metrics">
            <div>
              <strong>{p.assets.length}</strong>
              <span>Scoped assets</span>
            </div>
            <div>
              <strong>{p.evidence.length}</strong>
              <span>Evidence sources</span>
            </div>
            <div>
              <strong>
                {p.edges.filter((e) => !e.style?.strokeDasharray).length}
              </strong>
              <span>Supported links</span>
            </div>
            <div>
              <strong>
                {p.containmentCoverage === undefined
                  ? "—"
                  : `${Math.round(p.containmentCoverage * 100)}%`}
              </strong>
              <span>
                {p.containmentCoverage === undefined
                  ? "Containment coverage unavailable"
                  : p.containmentVersion === undefined ? "Latest simulated containment preview" : `Containment preview for scenario v${p.containmentVersion}`}
              </span>
            </div>
          </div>
        </section>
        <div className="panel topology-note">
          <span className="eyebrow">Operational boundary</span>
          <p>
            {p.synthetic
              ? "Synthetic scenario preview. No live model, authentication or response execution is connected."
              : "Subscriptions are authoritative. Preview predictions do not establish verified containment."}
          </p>
        </div>
      </motion.section>
      <motion.aside
        className="ops-right"
        initial={instant ? false : { opacity: 0, transform: "translateY(6px)" }}
        animate={{ opacity: 1, transform: "translateY(0px)" }}
        transition={{ duration, ease: [0.23, 1, 0.32, 1] }}
      >
        <section className="panel">
          <div className="panel-title">
            <h2>Decision queue</h2>
            <span>Human approval</span>
          </div>
          {p.decisions}
        </section>
        <section className="panel ops-timeline">
          <div className="panel-title">
            <h2>Incident chronology</h2>
          </div>
          {p.timeline}
        </section>
      </motion.aside>
    </div>
  );
}
