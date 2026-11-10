"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "motion/react";
import { ArrowRight, ArrowUpRight, Check, CheckCircle2, FileText, LockKeyhole } from "@/components/ui/icons";
import { accessRecords, recordedRun, recordedStages } from "./recorded-workflow";

const easeOut = [0.23, 1, 0.32, 1] as const;

export function useMotionPreference() {
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

function AccessChecks({ phase }: { phase: number }) {
  const record = accessRecords[phase];
  const checks = [
    { label: "New login", code: record.login, success: "Allowed" },
    { label: "Earlier session", code: record.session, success: "Allowed" },
    { label: "App health", code: record.health, success: "Available" },
  ];
  return <dl className="bb-access-checks">
    {checks.map(check => <div key={check.label} data-allowed={check.code === 200}>
      <dt>{check.label}</dt>
      <dd><span className="bb-check-outcome">{check.code === 200 ? <CheckCircle2 size={17} /> : <LockKeyhole size={17} />}{check.code === 200 ? check.success : "Blocked"}</span><span className="bb-check-code">HTTP {check.code}</span></dd>
    </div>)}
  </dl>;
}

export function RecordedAccess() {
  const reduce = useMotionPreference();
  const [phase, setPhase] = useState(2);
  const [keyboard, setKeyboard] = useState(false);
  const record = accessRecords[phase];
  return <section className="bb-access-record" aria-label="Recorded application access checks">
    <div className="bb-record-heading"><span>One application. Three checkpoints.</span><span className="bb-status-label">Recorded run</span></div>
    <div className="bb-record-switch" aria-label="Recorded checkpoint">
      {accessRecords.map((item, index) => <button key={item.label} type="button" aria-pressed={phase === index} onClick={event => { setKeyboard(event.detail === 0); setPhase(index); }}>{item.label}</button>)}
    </div>
    <motion.div className="bb-access-record-title" key={phase} initial={reduce || keyboard ? false : { opacity: .3, transform: "translateY(5px)" }} animate={{ opacity: 1, transform: "translateY(0px)" }} transition={{ duration: reduce || keyboard ? 0 : .2, ease: easeOut }}>
      <h2>{record.title}</h2><p>{record.detail}</p>
    </motion.div>
    <AccessChecks phase={phase} />
    <footer><span>Owned local application</span><time dateTime={recordedRun.date}>{recordedRun.label}</time></footer>
    <p className="bb-record-boundary">Explore a completed test. These controls do not change a running system.</p>
  </section>;
}

function RecordedDetail({ step }: { step: number }) {
  if (step === 0) return <div className="bb-record-detail">
    <FileText size={24} aria-hidden="true" /><h3>Source activity, preserved.</h3><p>36 events captured from an owned application.</p>
    <dl className="bb-record-events">{[
      { label: "HTTP requests", count: recordedRun.events.http },
      { label: "Login events", count: recordedRun.events.login },
      { label: "Database queries", count: recordedRun.events.database },
    ].map(row => <div key={row.label}><dt>{row.label}</dt><dd><span className="bb-event-bar" aria-hidden="true"><i style={{ transform: `scaleX(${row.count / 19})` }} /></span><strong>{row.count}</strong></dd></div>)}</dl>
    <span className="bb-record-detail-footnote">Original retained · derivative reviewed before model access</span>
  </div>;
  if (step === 1) return <div className="bb-record-detail">
    <span className="bb-record-provider">NVIDIA Nemotron</span><h3>Three reads. Cited observations.</h3><p>Four completed model calls in this investigation.</p>
    <ol className="bb-record-tool-list">{["Retrieve approved evidence", "Inspect observed assets", "Summarize recorded outcomes"].map(label => <li key={label}><CheckCircle2 size={18} /><span>{label}</span><span>Completed</span></li>)}</ol>
    <span className="bb-record-detail-footnote">Two findings returned for human review</span>
  </div>;
  if (step === 2) return <div className="bb-record-detail">
    <LockKeyhole size={24} aria-hidden="true" /><h3>Two roles. A deliberate decision.</h3><p>The proposal and approval came from different accounts.</p>
    <div className="bb-record-people"><div><span>I</span><strong>Investigator</strong><small>Proposed disable</small></div><ArrowRight size={22} aria-hidden="true" /><div><span>C</span><strong>Commander</strong><small>Approved its impact</small></div></div>
    <span className="bb-record-detail-footnote">One historical login verified; compromise was not established</span>
  </div>;
  if (step === 3 || step === 4) return <div className="bb-record-detail">
    <span className="bb-record-provider">Independent application checks</span><h3>{step === 3 ? "Access denied. Health available." : "Recovery keeps old sessions out."}</h3><p>{step === 3 ? "Measured after the approved disable." : "Measured after a fresh, separately approved restore."}</p>
    <AccessChecks phase={step === 3 ? 1 : 2} />
    <span className="bb-record-detail-footnote">{step === 3 ? "The previously working session lost access to notes." : "A new session could read notes. The old session could not."}</span>
  </div>;
  return <div className="bb-record-detail">
    <FileText size={24} aria-hidden="true" /><h3>The result has a record.</h3><p>Both application receipts matched the protected report.</p>
    <div className="bb-record-receipts"><div><CheckCircle2 size={20} /><span><strong>Disable access</strong><small>Saved application receipt matched</small></span></div><div><CheckCircle2 size={20} /><span><strong>Restore login</strong><small>Saved application receipt matched</small></span></div></div>
    <span className="bb-record-detail-footnote">Evidence, distinct human decisions and verified effects preserved</span>
  </div>;
}

function ReviewContext({ step }: { step: number }) {
  const content = [
    { title: "Review before sharing", label: "Model access", value: "Human approved", text: "Only the reviewed, pseudonymized derivative reached NVIDIA. Original logs stayed in restricted storage." },
    { title: "Keep uncertainty visible", label: "Finding", value: "Historical login", text: "A successful login was recorded. That alone does not establish compromise, relaying or current access." },
    { title: "Name the tradeoff", label: "Target scope", value: "One local account", text: "Disabling access blocks new logins and authenticated notes. Existing sessions are revoked; health remains available." },
    { title: "Measure the outcome", label: "Recorded effect", value: "Access disabled", text: "The interface and application agreed. This result concerns one application account, not host or network containment." },
    { title: "Review recovery too", label: "Old sessions", value: "Still revoked", text: "Restoration had its own proposal and approval. New sessions worked without reviving the previous session." },
    { title: "Keep the scope honest", label: "Verified effects", value: "Disable + restore", text: "This completed local exercise verifies application access controls. It does not establish that an enterprise incident is resolved." },
  ][step];
  return <aside className="bb-demo-decision bb-record-context"><h3>{content.title}</h3><dl><dt>{content.label}</dt><dd>{content.value}</dd></dl><p>{content.text}</p><span><LockKeyhole size={15} />Human control throughout</span></aside>;
}

export function RecordedWalkthrough() {
  const reduce = useMotionPreference();
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const [visible, setVisible] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: .15 });
  useEffect(() => {
    const sync = () => setVisible(document.visibilityState === "visible");
    sync(); document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  useEffect(() => {
    if (!playing || !inView || !visible || reduce) return;
    const timer = window.setTimeout(() => { if (step === recordedStages.length - 1) setPlaying(false); else setStep(step + 1); }, 6500);
    return () => window.clearTimeout(timer);
  }, [step, playing, inView, visible, reduce]);
  useEffect(() => { if (reduce) setPlaying(false); }, [reduce]);
  const choose = (index: number, byKeyboard: boolean) => { setKeyboard(byKeyboard); setPlaying(false); setStep(index); };
  const instant = reduce || keyboard;
  const scene = recordedStages[step];
  return <div ref={ref} className="bb-product-frame bb-recorded-workflow" data-instant={instant} id="product-preview">
    <div className="bb-preview-toolbar"><strong>From logs to a verified response</strong><span className="bb-example-label">Recorded {recordedRun.label}</span><a href="/command">Open workspace <ArrowUpRight size={15} /></a></div>
    <div className="bb-product-inner">
      <aside className="bb-preview-sidebar" aria-label="Recorded workflow stages"><span className="bb-preview-section">The completed workflow</span>{recordedStages.map((item, index) => <button type="button" key={item.label} className={step === index ? "bb-preview-nav bb-preview-nav-active" : "bb-preview-nav"} aria-current={step === index ? "step" : undefined} onClick={event => choose(index, event.detail === 0)}><span>{index < step ? <Check size={12} /> : String(index + 1).padStart(2, "0")}</span>{item.label}</button>)}<div className="bb-preview-sidebar-note"><LockKeyhole size={17} /><p>AI investigates.<br />People decide.</p></div></aside>
      <div className="bb-preview-workspace">
        <header className="bb-preview-heading"><div><span className="bb-small-label">Owned application access</span><h2>A real local response cycle</h2></div><span className="bb-status-label">Completed record</span></header>
        <div className="bb-demo-orchestration" aria-label="Recorded workflow sequence">
          <div className="bb-orchestration-track" aria-hidden="true"><i style={{ transform: `scaleX(${step / (recordedStages.length - 1)})` }} /></div>
          <div className="bb-orchestration-steps">{recordedStages.map((item, index) => <button type="button" key={item.label} className={index === step ? "bb-orchestration-active" : index < step ? "bb-orchestration-complete" : ""} aria-current={index === step ? "step" : undefined} onClick={event => choose(index, event.detail === 0)}><span>{index < step ? <Check size={12} /> : index + 1}</span><strong>{item.label}</strong></button>)}</div>
          <div className="bb-orchestration-status"><CheckCircle2 size={13} /><span>{scene.operation}</span><time dateTime={scene.dateTime}>{scene.time}</time></div>
        </div>
        <div className="bb-preview-body"><section className="bb-record-stage" aria-label={scene.label}><RecordedDetail step={step} /></section><ReviewContext step={step} /></div>
        <div className="bb-scene-caption"><motion.div key={step} initial={instant ? false : { opacity: .3, transform: "translateY(5px)" }} animate={{ opacity: 1, transform: "translateY(0px)" }} transition={{ duration: instant ? 0 : .2, ease: easeOut }}><span className="bb-small-label">{String(step + 1).padStart(2, "0")} / 06</span><h3>{scene.title}</h3><p>{scene.detail}</p></motion.div><button type="button" className="bb-demo-play" onClick={event => { setKeyboard(event.detail === 0); if (reduce) { setStep((step + 1) % recordedStages.length); return; } if (playing) { setPlaying(false); return; } if (step === recordedStages.length - 1) setStep(0); setPlaying(true); }}>{reduce ? "Next stage" : playing ? "Pause replay" : step === recordedStages.length - 1 ? "Replay record" : "Play record"}<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={playing ? "M5 3v10M11 3v10" : "m5 3 8 5-8 5Z"} /></svg></button></div>
        <p className="bb-replay-boundary">Historical results from an owned local test. Playback makes no model calls or application changes.</p>
      </div>
    </div>
  </div>;
}
