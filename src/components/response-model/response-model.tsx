"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import type { ResponseModelLink, ResponseModelNode, ResponseScene, ResponseCameraView } from "./types";
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
  const savedView = useRef<ResponseCameraView | null>(null);
  const savedIds = useRef("");
  const [zoom, setZoom] = useState(1);
  const [touchControls, setTouchControls] = useState(false);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<string | undefined>(activeId);
  const data = JSON.stringify({ nodes, links });
  const nodeIds = nodes.map(node=>node.id).join("\0");
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
        owned?.focus(id);
        selection.current?.(id);
      }, instant || window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => { if (!cancelled) { setReady(false); setUnavailable(true); } }, view => setZoom(view.zoom));
      if (savedView.current && savedIds.current === nodeIds) { owned.restoreView(savedView.current); owned.setInstant(true); }
      else setZoom(1);
      scene.current = owned;
      setReady(true);
    }).catch(() => { if (!cancelled) setUnavailable(true); });
    return () => { cancelled = true; if(owned) { savedView.current=owned.getView(); savedIds.current=nodeIds; } owned?.dispose(); if (scene.current === owned) scene.current = null; };
  }, [near, data, variant]);

  useEffect(() => { scene.current?.setMotion(moving); }, [moving, ready]);
  useEffect(() => { scene.current?.setInstant(instant || reduced || paused); }, [instant, reduced, paused, ready]);
  useEffect(() => {
    const update = () => scene.current?.setVisible(visible && !document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, [visible, ready]);
  useEffect(() => { setSelected(activeId); }, [activeId]);
  useEffect(() => { scene.current?.select(selected); }, [selected, ready]);
  useEffect(() => { scene.current?.setGestures(touchControls); }, [touchControls, ready]);

  const focus = (nodeId: string, immediately = false) => { setSelected(nodeId); scene.current?.select(nodeId); scene.current?.focus(nodeId, immediately || instant || reduced); };
  const choose = (node: ResponseModelNode, immediately = false) => { focus(node.id, immediately); onSelect?.(node.id); };
  const selectedNode = nodes.find(node=>node.id===selected);
  const keyCamera = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if(event.target !== event.currentTarget || !ready) return;
    const api=scene.current;
    if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","+","=","-","Home","[","]","Escape"].includes(event.key)) event.preventDefault();
    if(event.key==="ArrowLeft") api?.pan(-1,0,true);
    if(event.key==="ArrowRight") api?.pan(1,0,true);
    if(event.key==="ArrowUp") api?.pan(0,1,true);
    if(event.key==="ArrowDown") api?.pan(0,-1,true);
    if(event.key==="+" || event.key==="=") api?.zoomBy(1.2,true);
    if(event.key==="-") api?.zoomBy(1/1.2,true);
    if(event.key==="[") api?.rotate(-1,true);
    if(event.key==="]") api?.rotate(1,true);
    if(event.key==="Home") api?.reset(true);
    if(event.key==="Escape") setTouchControls(false);
  };
  return <section className={`bb-response-model bb-model-${variant} ${className}`} aria-labelledby={`${id}-title`} data-ready={ready} data-motion={moving} data-webgl={unavailable ? "unavailable" : "available"}>
    <header className="bb-model-heading"><div><span className="bb-model-caption">Spatial response twin</span><h3 id={`${id}-title`}>{title}</h3></div><span className="bb-model-badge">3D model</span></header>
    <div className="bb-model-stage" ref={stage} tabIndex={ready ? 0 : -1} role="group" aria-label="Response twin camera" aria-describedby={`${id}-camera-help`} onKeyDown={keyCamera} data-touch-controls={touchControls}>
      <div className="bb-model-floor" aria-hidden="true" />
      <div className="bb-model-labels" ref={labelLayer} aria-label="Model assets">
        {nodes.map((node, index) => <button type="button" key={node.id} data-model-id={node.id} data-selected={selected === node.id} aria-pressed={selected === node.id} onClick={event => choose(node,event.detail === 0)} className="bb-model-label" style={{ "--bb-label-left": `${18 + (index % 3) * 32}%`, "--bb-label-top": `${39 + Math.floor(index / 3) * 32}%` } as CSSProperties}>
          <strong>{node.label}</strong>{node.state && <span>{displayLabel(node.state)}</span>}
        </button>)}
      </div>
      {!ready && <div className="bb-model-static-hardware" aria-hidden="true">{nodes.slice(0, 6).map(node => <span key={node.id}><i /><i /><i /></span>)}</div>}
      <div className="bb-model-corner" aria-hidden="true"><span />B / B<span /></div>
    </div>
    <div className="bb-model-controls">
      <span className="bb-model-explainer">{variant === "showcase" ? "Illustrative synthetic paths" : "Scoped scenario relationships"}</span>
      <div className="bb-camera-toolbar" role="group" aria-label="Response twin view controls">
        <div className="bb-camera-zoom" role="group" aria-label="Zoom controls">
          <button type="button" disabled={!ready || zoom<=.75} onClick={event=>scene.current?.zoomBy(1/1.2,event.detail===0)} aria-label="Zoom model out">−</button>
          <output aria-label="Model zoom">{Math.round(zoom*100)}%</output>
          <button type="button" disabled={!ready || zoom>=3} onClick={event=>scene.current?.zoomBy(1.2,event.detail===0)} aria-label="Zoom model in">+</button>
        </div>
        <div role="group" aria-label="Pan controls">
          {([[-1,0,"left","←"],[0,1,"up","↑"],[0,-1,"down","↓"],[1,0,"right","→"]] as const).map(([x,y,name,symbol])=><button type="button" key={name} disabled={!ready} onClick={event=>scene.current?.pan(x,y,event.detail===0)} aria-label={`Pan model ${name}`}>{symbol}</button>)}
        </div>
        <div role="group" aria-label="Rotation controls"><button type="button" disabled={!ready} onClick={event=>scene.current?.rotate(-1,event.detail===0)} aria-label="Rotate model left">↶</button><button type="button" disabled={!ready} onClick={event=>scene.current?.rotate(1,event.detail===0)} aria-label="Rotate model right">↷</button></div>
        <button type="button" disabled={!ready} onClick={event=>scene.current?.reset(event.detail===0)} aria-label="Reset model view">Reset view</button>
        <button type="button" className="bb-touch-camera" disabled={!ready} aria-pressed={touchControls} onClick={()=>setTouchControls(value=>!value)}>{touchControls ? "Exit touch controls" : "Enable touch controls"}</button>
        {!instant && !reduced && (running ?? variant === "showcase") && <button type="button" onClick={()=>setPaused(value=>!value)} aria-pressed={paused}>{paused ? "Resume motion" : "Pause motion"}</button>}
      </div>
      <label className="bb-camera-focus">Focus asset<select aria-label="Focus model asset" disabled={!ready || !nodes.length} value={selectedNode?.id ?? ""} onChange={event=>focus(event.target.value,document.documentElement.dataset.input==="keyboard")}><option value="" disabled>Choose an asset</option>{nodes.map(node=><option key={node.id} value={node.id}>{node.label}</option>)}</select></label>
    </div>
    <p className="bb-model-camera-help" id={`${id}-camera-help`}>{touchControls ? "Touch controls enabled: drag to pan; pinch with two fingers to zoom. Exit touch controls to scroll the page." : "Drag to rotate; Shift-drag to pan. Ctrl/⌘ + wheel zooms. Focus the camera and use arrows to pan, +/− to zoom, [/] to rotate, and Home to reset."}</p>
    <p className="bb-model-footnote">{unavailable ? "3D rendering is unavailable. The complete model remains accessible below." : "Select an asset to inspect it. Offscreen assets remain in Focus asset and the full record below. Signal motion shows relationship direction, not measured traffic."}</p>
    <details className="bb-model-record"><summary>Read assets and relationships</summary><ul>{nodes.map(node => <li key={node.id}><button type="button" onClick={event => choose(node,event.detail===0)}>{node.label}</button><span>{node.kind ? displayLabel(node.kind) : "Asset"}{node.state ? ` · ${displayLabel(node.state)}` : ""}</span></li>)}</ul><ul>{links.map(link => <li key={link.id}><span>{nodes.find(node => node.id === link.from)?.label ?? "Source unavailable"} → {nodes.find(node => node.id === link.to)?.label ?? "Target unavailable"}</span><span>{link.label ? `${displayLabel(link.label)} · ` : ""}{link.enabled === false ? "Disabled" : "Enabled"}{link.verified === undefined ? "" : link.verified ? " · Evidence supported" : " · Hypothesis"}</span></li>)}</ul>{!nodes.length && <p>No assets available in this scope.</p>}</details>
  </section>;
}
