"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import type { ResponseModelLink, ResponseModelNode, ResponseScene } from "./types";
import { displayLabel } from "../ui/labels";
import "./response-model.css";

export type { ResponseModelLink, ResponseModelNode } from "./types";

export interface ResponseModelProps {
  nodes: ResponseModelNode[];
  links: ResponseModelLink[];
  variant?: "showcase" | "operational";
  activeId?: string;
  onSelect?: (id: string) => void;
  instant?: boolean;
  running?: boolean;
  className?: string;
  title?: string;
}

/** Canvas is a spatial enhancement. The complete scoped node/link record stays in HTML. */
export function ResponseModel({ nodes, links, variant = "showcase", activeId, onSelect, instant = false, running, className = "", title = "Response model" }: ResponseModelProps) {
  const id = useId();
  const stage = useRef<HTMLDivElement>(null);
  const labelLayer = useRef<HTMLDivElement>(null);
  const scene = useRef<ResponseScene | null>(null);
  const selection = useRef(onSelect);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<string | undefined>(activeId);
  const data = JSON.stringify({ nodes, links });
  const moving = !instant && !reduced && !paused && (running ?? variant === "showcase");
  selection.current = onSelect;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(query.matches);
    change();
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);

  useEffect(() => {
    const host = stage.current;
    if (!host) return;
    const nearby = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setNear(true);
    }, { rootMargin: "240px" });
    const inView = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), { threshold: .02 });
    nearby.observe(host);
    inView.observe(host);
    return () => { nearby.disconnect(); inView.disconnect(); };
  }, []);

  useEffect(() => {
    if (!near || !stage.current || !labelLayer.current) return;
    let cancelled = false;
    let owned: ResponseScene | undefined;
    setReady(false);
    setUnavailable(false);
    const payload = JSON.parse(data) as { nodes: ResponseModelNode[]; links: ResponseModelLink[] };
    import("./scene-renderer").then(({ createResponseScene }) => {
      if (cancelled || !stage.current || !labelLayer.current) return;
      owned = createResponseScene(stage.current, labelLayer.current, payload, variant, id => {
        setSelected(id);
        selection.current?.(id);
      }, instant || window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => { if (!cancelled) { setReady(false); setUnavailable(true); } });
      scene.current = owned;
      setReady(true);
    }).catch(() => { if (!cancelled) setUnavailable(true); });
    return () => { cancelled = true; owned?.dispose(); if (scene.current === owned) scene.current = null; };
  }, [near, data, variant, instant]);

  useEffect(() => { scene.current?.setMotion(moving); }, [moving, ready]);
  useEffect(() => { scene.current?.setInstant(instant || reduced || paused); }, [instant, reduced, paused, ready]);
  useEffect(() => {
    const update = () => scene.current?.setVisible(visible && !document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, [visible, ready]);
  useEffect(() => { scene.current?.select(activeId ?? selected); }, [activeId, selected, ready]);

  const choose = (node: ResponseModelNode) => { setSelected(node.id); onSelect?.(node.id); };
  return <section className={`bb-response-model bb-model-${variant} ${className}`} aria-labelledby={`${id}-title`} data-ready={ready} data-motion={moving} data-webgl={unavailable ? "unavailable" : "available"}>
    <header className="bb-model-heading"><div><span className="bb-model-caption">Spatial response twin</span><h3 id={`${id}-title`}>{title}</h3></div><span className="bb-model-badge">3D model</span></header>
    <div className="bb-model-stage" ref={stage}>
      <div className="bb-model-floor" aria-hidden="true" />
      <div className="bb-model-labels" ref={labelLayer} aria-label="Model assets">
        {nodes.map((node, index) => <button type="button" key={node.id} data-model-id={node.id} data-selected={(activeId ?? selected) === node.id} onClick={() => choose(node)} className="bb-model-label" style={{ "--bb-label-left": `${18 + (index % 3) * 32}%`, "--bb-label-top": `${39 + Math.floor(index / 3) * 32}%` } as CSSProperties}>
          <strong>{node.label}</strong>{node.state && <span>{displayLabel(node.state)}</span>}
        </button>)}
      </div>
      {!ready && <div className="bb-model-static-hardware" aria-hidden="true">{nodes.slice(0, 6).map(node => <span key={node.id}><i /><i /><i /></span>)}</div>}
      <div className="bb-model-corner" aria-hidden="true"><span />B / B<span /></div>
    </div>
    <div className="bb-model-controls">
      <span className="bb-model-explainer">{variant === "showcase" ? "Illustrative synthetic paths" : "Scoped scenario relationships"}</span>
      <div>{ready && <><button type="button" onClick={event => scene.current?.rotate(-1, event.detail === 0)} aria-label="Rotate model left">↶</button><button type="button" onClick={event => scene.current?.rotate(1, event.detail === 0)} aria-label="Rotate model right">↷</button><button type="button" onClick={event => scene.current?.reset(event.detail === 0)} aria-label="Reset model view">Reset</button></>}
        {!instant && !reduced && (running ?? variant === "showcase") && <button type="button" onClick={() => setPaused(value => !value)} aria-pressed={paused}>{paused ? "Resume motion" : "Pause motion"}</button>}
      </div>
    </div>
    <p className="bb-model-footnote">{unavailable ? "3D rendering is unavailable. The complete model remains accessible below." : "Select an asset to inspect it. Signal motion shows relationship direction, not measured traffic."}</p>
    <details className="bb-model-record"><summary>Read assets and relationships</summary><ul>{nodes.map(node => <li key={node.id}><button type="button" onClick={() => choose(node)}>{node.label}</button><span>{node.kind ? displayLabel(node.kind) : "Asset"}{node.state ? ` · ${displayLabel(node.state)}` : ""}</span></li>)}</ul><ul>{links.map(link => <li key={link.id}><span>{nodes.find(node => node.id === link.from)?.label ?? "Source unavailable"} → {nodes.find(node => node.id === link.to)?.label ?? "Target unavailable"}</span><span>{link.label ? `${displayLabel(link.label)} · ` : ""}{link.enabled === false ? "Disabled" : "Enabled"}{link.verified === undefined ? "" : link.verified ? " · Evidence supported" : " · Hypothesis"}</span></li>)}</ul>{!nodes.length && <p>No assets available in this scope.</p>}</details>
  </section>;
}
