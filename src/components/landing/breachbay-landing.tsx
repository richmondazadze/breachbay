"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, MotionConfig, useInView } from "motion/react";
import { ArrowRight, ArrowUpRight, Check, FileText, Network, CheckCircle2, Server, Database, LockKeyhole, MessagesSquare } from "@/components/ui/icons";
import { ResponseModel, type ResponseModelNode, type ResponseModelLink } from "@/components/response-model/response-model";

const stages = [
  { label: "Evidence", title: "Start with what you can prove.", detail: "Bring the alert and access log into one shared incident. Keep their source and classification attached.", note: "Evidence stays linked to its source.", operation: "Link the alert to its source" },
  { label: "Investigate", title: "Follow the evidence, together.", detail: "Nemotron inspects model-approved evidence and proposes a finding. Responders can inspect the trace and review its citations.", note: "An AI finding remains a hypothesis until reviewed.", operation: "Inspect model-approved evidence" },
  { label: "Preview", title: "See the tradeoff before deciding.", detail: "Preview app-host isolation. Database exposure falls, but the customer portal is degraded and the jump-host route remains.", note: "Remaining exposure and service impact are explicit.", operation: "Compare exposure and service impact" },
  { label: "Human approval", title: "The decision belongs to a person.", detail: "An authorized human reviews the current preview and records a justification. The AI service cannot approve or execute a response.", note: "Approval is tied to the current scenario and expires.", operation: "Wait for a separate human decision" },
  { label: "Verify", title: "Check what actually changed.", detail: "Execute the approved simulated response, inspect the result, and preserve the decision in a report. A partial outcome stays partial.", note: "Simulated execution. No action against a real network.", operation: "Record the partial simulated result" },
] as const;
const easeOut = [0.23, 1, 0.32, 1] as const;

function useMotionPreference() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(preference.matches);
    sync();
    preference.addEventListener("change", sync);
    return () => preference.removeEventListener("change", sync);
  }, []);
  return reduce;
}

function usePageVisible() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const sync = () => setVisible(document.visibilityState === "visible");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  return visible;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <span className={compact ? "bb-wordmark bb-wordmark-small" : "bb-wordmark"}><img src="/brand/harbor.svg" width={compact ? 24 : 30} height={compact ? 24 : 30} alt="" />BreachBay<span className="bb-brand-dot">.</span></span>;
}

function HeroModel() {
  const reduce = useMotionPreference();
  const [preview, setPreview] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const [selected, setSelected] = useState("database");
  const nodes: ResponseModelNode[] = [
    { id: "workstation", label: "Workstation", kind: "HOST", state: "COMPROMISED" },
    { id: "app-host", label: "Application host", kind: "HOST", state: preview ? "ISOLATED" : "ACTIVE" },
    { id: "database", label: "Customer database", kind: "DATABASE", state: "ACTIVE" },
    { id: "jump-host", label: "Jump host", kind: "HOST", state: "ACTIVE" },
    { id: "customer-portal", label: "Customer portal", kind: "SERVICE", state: preview ? "DEGRADED" : "ACTIVE" },
  ];
  const links: ResponseModelLink[] = [
    { id: "workstation-app", from: "workstation", to: "app-host", enabled: !preview, verified: true, label: "Communication route" },
    { id: "app-database", from: "app-host", to: "database", enabled: !preview, verified: true, label: "Communication route" },
    { id: "workstation-jump", from: "workstation", to: "jump-host", enabled: true, verified: true, label: "Communication route" },
    { id: "jump-database", from: "jump-host", to: "database", enabled: true, verified: true, label: "Remaining communication route" },
    { id: "portal-app", from: "customer-portal", to: "app-host", enabled: true, verified: true, label: "Service dependency" },
  ];
  const selectedNode = nodes.find(node => node.id === selected);
  return <div className="bb-hero-model-shell">
    <div className="bb-hero-model-heading"><span><i />Interactive response twin</span><span className="bb-status-label">Synthetic</span></div>
    <ResponseModel nodes={nodes} links={links} variant="showcase" activeId={selected} onSelect={setSelected} instant={reduce || keyboard} running={!reduce} title="Explore the synthetic response twin" className="bb-landing-response-model" />
    <div className="bb-model-readout"><span>{selectedNode?.label ?? "Customer database"}</span><strong>{selectedNode?.state === "ISOLATED" ? "Isolated in preview" : selectedNode?.state === "DEGRADED" ? "Service degraded" : selectedNode?.state === "COMPROMISED" ? "Initial compromise" : "In the modeled scenario"}</strong></div>
    <div className="bb-hero-model-controls"><div className="bb-model-segmented" aria-label="Response model scenario">{[false, true].map(value => <button type="button" key={String(value)} aria-pressed={preview === value} onClick={event => { setKeyboard(event.detail === 0); setPreview(value); }}>{value ? "Isolation preview" : "Before response"}</button>)}</div></div>
    <p className="bb-model-boundary">{preview ? "One database route remains. The customer portal is degraded." : "Two modeled routes reach the customer database."} This example changes no real system.</p>
  </div>;
}

function SceneGraph({ step, instant, animate }: { step: number; instant: boolean; animate: boolean }) {
  const preview = step >= 2;
  return <div className="bb-scene-graph" data-instant={instant} aria-label={preview ? "Synthetic preview: app-host route blocked, jump-host database route remains, customer portal degraded" : "Synthetic scenario: two modeled paths lead to the customer database"}>
    <svg className="bb-scene-connectors" viewBox="0 0 620 290" fill="none" aria-hidden="true">
      <path d="M110 95 H258" className={preview ? "bb-route-off" : "bb-route-on"} strokeWidth="2" />
      <path d="M352 95 H510" className={preview ? "bb-route-off" : "bb-route-on"} strokeDasharray={preview ? "5 6" : undefined} strokeWidth="2" />
      <path d="M110 120 V246 H260" className="bb-route-on" strokeWidth="2" />
      <path d="M353 246 H458 Q478 246 478 226 V118 H510" className="bb-route-on" strokeWidth="2" />
      <path d="M307 120 V148" className={preview ? "bb-route-impact" : "bb-route-dependency"} strokeWidth="2" />
      {preview && <g><circle cx="417" cy="95" r="11" className="bb-route-block" /><path d="m413 91 8 8m0-8-8 8" className="bb-route-off" strokeWidth="1.5" /></g>}
      {animate && !instant && <g className="bb-route-packets">{!preview && <circle r="3.5"><animateMotion dur="3.1s" repeatCount="indefinite" path="M110 95 H510" /></circle>}<circle r="3.5"><animateMotion dur="4.1s" repeatCount="indefinite" path="M110 120 V246 H458 Q478 246 478 226 V118 H510" /></circle></g>}
    </svg>
    <div className="bb-graph-node bb-node-workstation"><Server size={18} /><strong>Workstation</strong><span>Initial compromise</span></div>
    <div className={"bb-graph-node bb-node-app" + (preview ? " bb-node-isolated" : "")}><Server size={18} /><strong>App host</strong><span>{preview ? "Isolated in preview" : "Observed route"}</span></div>
    <div className="bb-graph-node bb-node-database"><Database size={18} /><strong>Customer database</strong><span>Remaining exposure</span></div>
    <div className="bb-graph-node bb-node-jump"><Network size={18} /><strong>Jump host</strong><span>Route still open</span></div>
    <div className={"bb-graph-node bb-node-portal" + (preview ? " bb-node-degraded" : "")}><strong>Customer portal</strong><span>{preview ? "Service degraded" : "Service available"}</span></div>
  </div>;
}

function ProductDemo() {
  const reduce = useMotionPreference();
  const visible = usePageVisible();
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [keyboard, setKeyboard] = useState(false);
  const [replay, setReplay] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: .15 });
  useEffect(() => {
    if (!playing || !inView || !visible || reduce) return;
    const timer = window.setTimeout(() => { if (step === stages.length - 1) setPlaying(false); else setStep(step + 1); }, 4200);
    return () => window.clearTimeout(timer);
  }, [step, playing, inView, visible, reduce]);
  useEffect(() => { if (reduce) setPlaying(false); }, [reduce]);
  const choose = (index: number, byKeyboard = false) => { setKeyboard(byKeyboard); setPlaying(false); setStep(index); };
  const instant = reduce || keyboard;
  const scene = stages[step];
  return <div ref={ref} className="bb-product-frame" data-instant={instant} data-running={playing && inView && visible && !reduce} id="product-preview">
    <div className="bb-preview-toolbar"><Brand compact /><span className="bb-example-label">Synthetic walkthrough</span><a href="/command">Open workspace <ArrowUpRight size={15} /></a></div>
    <div className="bb-product-inner">
      <aside className="bb-preview-sidebar" aria-label="Example workspace navigation"><span className="bb-preview-section">The decision sequence</span>{stages.map((item, index) => <button type="button" key={item.label} className={step === index ? "bb-preview-nav bb-preview-nav-active" : "bb-preview-nav"} aria-current={step === index ? "step" : undefined} onClick={event => choose(index, event.detail === 0)}><span>{index < step ? <Check size={12} /> : String(index + 1).padStart(2, "0")}</span>{item.label}</button>)}<div className="bb-preview-sidebar-note"><LockKeyhole size={17} /><p>AI investigates.<br />People decide.</p></div></aside>
      <div className="bb-preview-workspace">
        <header className="bb-preview-heading"><div><span className="bb-small-label">Incident walkthrough</span><h2>Customer data at risk</h2></div><span className="bb-status-label">Synthetic</span></header>
        <div className="bb-demo-orchestration" aria-label="Illustrative investigation sequence"><div className="bb-orchestration-track" aria-hidden="true"><i style={{ transform: `scaleX(${(step + 1) / stages.length})` }} /></div><div className="bb-orchestration-steps">{stages.map((item, index) => <button type="button" key={item.label} className={index === step ? "bb-orchestration-active" : index < step ? "bb-orchestration-complete" : ""} aria-current={index === step ? "step" : undefined} onClick={event => choose(index, event.detail === 0)}><span>{index < step ? <Check size={12} /> : index + 1}</span><strong>{item.label}</strong></button>)}</div><div className="bb-orchestration-status"><span className="bb-operation-indicator" data-working={playing && inView && visible && !reduce} /><span>{scene.operation}</span><span>Illustrative sequence</span></div></div>
        <div className="bb-preview-body"><section className="bb-preview-topology"><div className="bb-panel-heading"><h3>Response twin</h3><span>Modeled paths</span></div><div className="bb-graph-scroll"><SceneGraph key={replay} step={step} instant={instant} animate={playing && inView && visible && !reduce} /></div><span className="bb-mobile-graph-hint">Scroll the model to follow both database routes</span><div className="bb-topology-legend"><span><i className="bb-legend-route" />Remaining route</span>{step >= 2 && <span><i className="bb-legend-blocked" />Blocked in preview</span>}<span>Illustrative scenario</span></div></section>
          <section className="bb-demo-decision"><div className="bb-panel-heading"><h3>{step < 2 ? "Cited evidence" : "Response tradeoff"}</h3><span>{step < 2 ? <FileText size={16} /> : <Network size={16} />}</span></div>{step < 2 ? <><div className="bb-evidence-line"><FileText size={15} /><div><strong>Application access log</strong><span>Observed database connection</span></div><Check size={15} /></div><div className="bb-evidence-line"><FileText size={15} /><div><strong>Endpoint alert</strong><span>Compromised workstation</span></div><Check size={15} /></div>{step === 1 && <div className="bb-demo-tool"><span className="bb-operation-indicator" data-working={playing && inView && visible && !reduce} /><strong>Nemotron investigation</strong><span>Reads approved evidence.<br />Returns cited hypotheses.</span></div>}<p className="bb-decision-note">Source-linked evidence. Findings require human review.</p></> : <><div className="bb-route-comparison"><span>Modeled database routes</span><div><small>Before</small><div className="bb-chart-track"><i /></div><strong>2</strong></div><div><small>Preview</small><div className="bb-chart-track"><motion.i initial={instant ? false : { transform: "scaleX(1)" }} animate={{ transform: "scaleX(.5)" }} transition={{ duration: instant ? 0 : .65, ease: easeOut }} /></div><strong>1</strong></div></div><div className="bb-service-impact"><span>Customer portal</span><strong>Degraded</strong></div><p className="bb-decision-note">Isolation reduces exposure. The jump-host route remains.</p></>}{step === 3 && <span className="bb-review-label"><LockKeyhole size={14} />Human decision required</span>}{step === 4 && <span className="bb-review-label"><CheckCircle2 size={14} />Partial simulated outcome</span>}</section>
        </div>
        <div className="bb-scene-caption"><motion.div key={step} initial={instant ? false : { opacity: .3, transform: "translateY(6px)" }} animate={{ opacity: 1, transform: "translateY(0px)" }} transition={{ duration: instant ? 0 : .24, ease: easeOut }}><span className="bb-small-label">{String(step + 1).padStart(2, "0")} / 05</span><h3>{scene.title}</h3><p>{scene.detail}</p></motion.div><button type="button" className="bb-demo-play" onClick={event => { setKeyboard(event.detail === 0); if (playing) { setPlaying(false); return; } if (reduce) { setStep(step === 4 ? 0 : step + 1); return; } if (step === 4) { setStep(0); setReplay(value => value + 1); } setPlaying(true); }}>{reduce ? "Next step" : playing ? "Pause walkthrough" : step === 4 ? "Replay walkthrough" : "Play walkthrough"}<span aria-hidden="true">{playing ? "Ⅱ" : "▷"}</span></button></div>
      </div>
    </div>
    <div className="bb-demo-step-controls" aria-label="Walkthrough steps">{stages.map((item, index) => <button type="button" key={item.label} className={step === index ? "bb-step-current" : ""} aria-label={item.label} aria-pressed={step === index} onClick={event => choose(index, event.detail === 0)}>{index + 1}<span>{item.label}</span></button>)}</div>
  </div>;
}

function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduce = useMotionPreference();
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: .12 });
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => { setEnhanced(true); }, []);
  return <motion.div ref={ref} className={className} initial={false} animate={enhanced && !seen && !reduce ? { opacity: 0, transform: "translateY(18px)" } : { opacity: 1, transform: "translateY(0px)" }} transition={{ duration: reduce ? 0 : .65, delay: reduce ? 0 : delay, ease: easeOut }}>{children}</motion.div>;
}

export function BreachBayLanding() {
  return <MotionConfig reducedMotion="user"><div className="bb-landing">
    <a className="bb-skip-link" href="#landing-main">Skip to content</a>
    <header className="bb-landing-header"><a href="/" aria-label="BreachBay home"><Brand /></a><nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#human-control">Human control</a><a className="bb-nav-workspace" href="/command">Open workspace <ArrowUpRight size={16} /></a></nav></header>
    <main id="landing-main">
      <section className="bb-hero" aria-labelledby="bb-hero-title"><div className="bb-hero-top"><Reveal className="bb-hero-copy"><span className="bb-eyebrow"><span />The incident response workspace</span><h1 id="bb-hero-title">Investigate<br />the breach.<span>Decide with evidence.</span></h1><p>A shared workspace for investigating simulated incidents, comparing response options, and keeping humans in control.</p><div className="bb-hero-actions"><a className="bb-primary-action" href="/command">Open workspace <ArrowUpRight size={18} /></a><a className="bb-text-action" href="#how-it-works">See how it works <ArrowRight size={17} /></a></div><p className="bb-hero-assurance"><LockKeyhole size={14} />AI proposes. Authorized people approve.</p></Reveal><Reveal className="bb-hero-model" delay={.08}><HeroModel /></Reveal></div><div className="bb-hero-product-intro"><h2>One shared incident.<br />Every step visible.</h2><p>Follow the evidence, watch the investigation unfold, and understand the impact before anyone acts.</p></div><Reveal className="bb-hero-product"><ProductDemo /></Reveal><p className="bb-hero-footnote">Investigate with NVIDIA Nemotron. Collaborate in real time. Preview every response.</p></section>
      <section className="bb-workflow-section bb-section" id="how-it-works" aria-labelledby="bb-workflow-title"><Reveal className="bb-section-heading"><span className="bb-eyebrow">From signal to a considered response</span><h2 id="bb-workflow-title">One incident.<br />A clear path forward.</h2><p>Less context switching. More clarity about what you know, what you’re deciding, and what still needs attention.</p></Reveal><div className="bb-workflow-list">{stages.map((stage,index) => <Reveal key={stage.label} className="bb-workflow-item" delay={index * .035}><span className="bb-workflow-number">0{index+1}</span><div><h3>{stage.label}</h3><p>{stage.note}</p></div><span className="bb-workflow-arrow" aria-hidden="true"><ArrowRight size={19} /></span></Reveal>)}</div></section>
      <section className="bb-feature-section bb-section" aria-labelledby="bb-evidence-title"><Reveal className="bb-evidence-illustration"><div className="bb-illustration-top"><FileText size={20} /><span>Shared evidence</span><span className="bb-status-label">Synthetic</span></div><div className="bb-proof-record"><span className="bb-small-label">Finding for review</span><h3>The application host can reach the customer database.</h3><p>Supported by an observed connection in the access log.</p><div className="bb-citation-tag"><FileText size={14} />Application access log <Check size={14} /></div></div><div className="bb-proof-bottom"><MessagesSquare size={18} /><p>Discuss the observation.<br /><strong>Keep its source in view.</strong></p><span className="bb-avatar-outline">R</span></div></Reveal><Reveal className="bb-feature-copy"><span className="bb-eyebrow">A shared understanding</span><h2 id="bb-evidence-title">Evidence your team<br />can follow.</h2><p>Keep evidence, findings, conversations and response decisions in the same incident. Inspect the AI’s investigation trace, follow its citations, and review what belongs in the record.</p><a className="bb-text-action" href="/command">Explore the workspace <ArrowRight size={17} /></a></Reveal></section>
      <section className="bb-feature-section bb-feature-reverse bb-section" id="human-control" aria-labelledby="bb-human-title"><Reveal className="bb-feature-copy"><span className="bb-eyebrow">Human control, built in</span><h2 id="bb-human-title">Know the impact.<br />Own the decision.</h2><p>A response can reduce exposure and disrupt a service at the same time. BreachBay previews that tradeoff before an authorized person approves an action.</p><p className="bb-feature-secondary">The AI service proposes. Humans approve. Execution changes the synthetic scenario, and verification records what changed.</p></Reveal><Reveal className="bb-approval-illustration"><div className="bb-illustration-top"><LockKeyhole size={20} /><span>Response review</span><span className="bb-status-label">Example</span></div><h3>Isolate the application host</h3><dl><div><dt>Database exposure</dt><dd>Reduced, route remains</dd></div><div><dt>Customer portal</dt><dd className="bb-impact-text">Service degraded</dd></div><div><dt>Execution</dt><dd>Simulated only</dd></div></dl><div className="bb-human-gate"><LockKeyhole size={17} /><span>Human approval required</span><span className="bb-gate-line" /></div><p>Review the preview. Record a reason.<br />Verify the outcome.</p></Reveal></section>
      <section className="bb-faq-section bb-section" aria-labelledby="bb-faq-title"><Reveal className="bb-faq-intro"><span className="bb-eyebrow">Before you enter</span><h2 id="bb-faq-title">Clear by design.</h2></Reveal><div className="bb-faq-list"><Reveal><h3>Does BreachBay change a real network?</h3><p>No. Response previews and execution operate on synthetic scenarios. The workspace makes that boundary explicit.</p></Reveal><Reveal><h3>What does the AI do?</h3><p>NVIDIA Nemotron investigates model-approved evidence and proposes findings and responses. Its output is validated, and people review the evidence and decisions.</p></Reveal><Reveal><h3>Can my team work together?</h3><p>Yes. Incident-scoped access lets responders share evidence, collaborate and follow the same live incident. Approval and execution depend on each person’s permissions.</p></Reveal></div></section>
      <section className="bb-final-section"><Reveal><span className="bb-eyebrow">BreachBay</span><h2>Bring the incident<br />into focus.</h2><a className="bb-primary-action" href="/command">Open workspace <ArrowUpRight size={18} /></a></Reveal></section>
    </main>
    <footer className="bb-landing-footer"><a href="/" aria-label="BreachBay home"><Brand compact /></a><span>Built for HackUTD. Designed for human decisions.</span><div><a href="https://github.com/richmondazadze/breachbay" target="_blank" rel="noopener noreferrer">Source <ArrowUpRight size={14} /></a><a href="/command">Workspace <ArrowUpRight size={14} /></a></div></footer>
  </div></MotionConfig>;
}
