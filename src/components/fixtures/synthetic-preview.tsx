/** Explicitly synthetic presentation fixture. Never used by ConnectedIncident. */
import type { Node, Edge } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import dagre from "@dagrejs/dagre";
export const assets = [
  {
    id: "workstation",
    label: "WS-014",
    detail: "Initial compromise",
    status: "compromised",
  },
  { id: "app", label: "APP-02", detail: "Application host", status: "exposed" },
  {
    id: "database",
    label: "DB-01",
    detail: "Critical customer store",
    status: "at risk",
  },
  {
    id: "gateway",
    label: "EDGE-01",
    detail: "Internet gateway",
    status: "healthy",
  },
  {
    id: "identity",
    label: "ID-01",
    detail: "Identity service",
    status: "unknown",
  },
  {
    id: "portal",
    label: "Customer portal",
    detail: "Dependent service",
    status: "healthy",
  },
];
const links = [
  ["gateway", "workstation"],
  ["workstation", "app"],
  ["app", "database"],
  ["app", "portal"],
  ["identity", "database"],
];
const layout = new dagre.graphlib.Graph()
  .setGraph({ rankdir: "LR", nodesep: 70, ranksep: 85 })
  .setDefaultEdgeLabel(() => ({}));
assets.forEach((a) => layout.setNode(a.id, { width: 170, height: 80 }));
links.forEach(([s, t]) => layout.setEdge(s, t));
dagre.layout(layout);
export const graphNodes: Node[] = assets.map((a) => ({
  id: a.id,
  position: { x: layout.node(a.id).x - 85, y: layout.node(a.id).y - 40 },
  data: {
    label: (
      <div className="graph-node">
        <span className={"node-dot " + a.status.replace(" ", "-")} />
        <strong>{a.label}</strong>
        <small>{a.detail}</small>
        <span className="node-status">{a.status}</span>
      </div>
    ),
  },
  style: { width: 170 },
  ariaLabel: `${a.label}, ${a.detail}, ${a.status}`,
}));
export const graphEdges: Edge[] = links.map(([s, t], i) => ({
  id: `${s}-${t}`,
  source: s,
  target: t,
  label: i === 4 ? "Hypothesis" : i === 3 ? "Depends on" : "Observed",
  style: {
    stroke: i === 4 ? "#8493a3" : i === 1 || i === 2 ? "#f2bc66" : "#5d7c81",
    strokeDasharray: i === 4 ? "5 5" : undefined,
  },
  markerEnd: { type: MarkerType.ArrowClosed },
  labelStyle: { fill: "var(--graph-label)", fontSize: 10 },
  labelBgStyle: { fill: "var(--panel)" },
}));
