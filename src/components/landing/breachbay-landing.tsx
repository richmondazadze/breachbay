"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, MotionConfig, useInView } from "motion/react";
import { ArrowRight, ArrowUpRight, FileText, LockKeyhole } from "@/components/ui/icons";
import { RecordedAccess, RecordedWalkthrough, useMotionPreference } from "./recorded-walkthrough";
import { recordedStages as stages } from "./recorded-workflow";
import { BrandArtwork } from "../brand-artwork";

const easeOut = [0.23, 1, 0.32, 1] as const;

function Brand({ compact = false }: { compact?: boolean }) {
  return <span className={compact ? "bb-wordmark bb-wordmark-small" : "bb-wordmark"}><img src="/brand/harbor.svg" width={compact ? 24 : 30} height={compact ? 24 : 30} alt="" />BreachBay<span className="bb-brand-dot">.</span></span>;
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
      <section className="bb-hero" aria-labelledby="bb-hero-title"><div className="bb-hero-top"><Reveal className="bb-hero-copy"><span className="bb-eyebrow"><span />The incident response workspace</span><h1 id="bb-hero-title">Investigate<br />the breach.<span>Decide with evidence.</span></h1><p>Bring source logs into one shared incident. Investigate with Nemotron, review application responses, and verify what changed.</p><div className="bb-hero-actions"><a className="bb-primary-action" href="/command">Open workspace <ArrowUpRight size={18} /></a><a className="bb-text-action" href="#how-it-works">See how it works <ArrowRight size={17} /></a></div><p className="bb-hero-assurance"><LockKeyhole size={14} />AI investigates. People control the response.</p></Reveal><div className="bb-hero-art"><BrandArtwork name="command-hero" priority sizes="(max-width: 850px) 92vw, (max-width: 1360px) 50vw, 650px" /></div></div><div className="bb-hero-product-intro"><h2>One shared incident.<br />Every step visible.</h2><p>Explore a completed local run: source evidence, a real investigation, and separately approved application responses.</p></div><Reveal className="bb-hero-product"><RecordedWalkthrough /></Reveal><p className="bb-hero-footnote">Investigate with NVIDIA Nemotron. Collaborate in real time. Preview every response.</p></section>
      <section className="bb-workflow-section bb-section" id="how-it-works" aria-labelledby="bb-workflow-title"><div className="bb-section-heading"><span className="bb-eyebrow">From signal to a considered response</span><h2 id="bb-workflow-title">One incident.<br />A clear path forward.</h2><p>Know what the evidence supports, what you’re deciding, and what still needs attention.</p><BrandArtwork name="investigation" className="bb-workflow-art" sizes="(max-width: 600px) 240px, 300px" /></div><div className="bb-workflow-list">{stages.map((stage,index) => <div key={stage.label} className="bb-workflow-item"><span className="bb-workflow-number">0{index+1}</span><div><h3>{stage.label}</h3><p>{stage.note}</p></div><span className="bb-workflow-arrow" aria-hidden="true"><ArrowRight size={19} /></span></div>)}</div></section>
      <section className="bb-feature-section bb-section" aria-labelledby="bb-evidence-title">
        <div className="bb-feature-art"><BrandArtwork name="evidence-intake" sizes="(max-width: 600px) 260px, 350px" /></div>
        <div className="bb-feature-copy"><span className="bb-eyebrow">A shared understanding</span><h2 id="bb-evidence-title">Evidence your team<br />can follow.</h2><p>Keep source logs, findings and conversations in the same incident. Follow each citation back to the evidence and review what belongs in the record.</p>
          <div className="bb-source-observation"><FileText size={18} aria-hidden="true" /><div><strong>“The log records a successful login.”</strong><p>A human-reviewed historical observation from our local run. Compromise and current access remain unproven.</p></div></div>
          <a className="bb-text-action" href="/command">Explore the workspace <ArrowRight size={17} /></a>
        </div>
      </section>
      <section className="bb-feature-section bb-feature-reverse bb-section" id="human-control" aria-labelledby="bb-human-title">
        <div className="bb-feature-copy"><span className="bb-eyebrow">Human control, built in</span><h2 id="bb-human-title">Know the impact.<br />Own the decision.</h2><p>Responders propose an application action. A separate commander reviews the impact and approves it. Independent checks verify what actually changed.</p><p className="bb-feature-secondary">Nemotron returns cited observations for review. Approval and execution stay with your team.</p><div className="bb-decision-sequence" aria-label="Human response workflow"><span>Propose</span><ArrowRight size={15} aria-hidden="true" /><span>Review</span><ArrowRight size={15} aria-hidden="true" /><span>Verify</span></div></div>
        <div className="bb-feature-art"><BrandArtwork name="human-review" sizes="(max-width: 600px) 85vw, 440px" /></div>
      </section>
      <section className="bb-feature-section bb-outcome-section bb-section" aria-labelledby="bb-outcome-title">
        <div className="bb-feature-copy"><span className="bb-eyebrow">From decision to a measured result</span><h2 id="bb-outcome-title">Check the change.<br />Keep the proof.</h2><p>Compare the recorded application checks before disable, after disable, and after a separately approved restoration.</p><p className="bb-feature-secondary">New logins returned after recovery. Previously revoked sessions stayed blocked. The health endpoint remained available throughout.</p></div>
        <RecordedAccess />
      </section>
      <section className="bb-faq-section bb-section" aria-labelledby="bb-faq-title"><Reveal className="bb-faq-intro"><span className="bb-eyebrow">Before you enter</span><h2 id="bb-faq-title">Clear by design.</h2></Reveal><div className="bb-faq-list"><Reveal><h3>What can BreachBay change?</h3><p>The current connector disables or restores login in an owned local application. Disabling access also invalidates its existing sessions. It does not isolate enterprise hosts or networks. The recorded walkthrough shows this scope, including separately approved recovery and independent checks.</p></Reveal><Reveal><h3>What does the AI do?</h3><p>NVIDIA Nemotron reads explicitly approved log derivatives, follows source citations, and returns findings with uncertainty. It cannot approve or execute application responses. Original log files stay in restricted storage.</p></Reveal><Reveal><h3>Can my team work together?</h3><p>Yes. Incident-scoped access lets responders share evidence, collaborate and follow the same live incident. Approval and execution depend on each person’s permissions.</p></Reveal></div></section>
      <section className="bb-final-section"><Reveal><span className="bb-eyebrow">BreachBay</span><h2>Bring the incident<br />into focus.</h2><a className="bb-primary-action" href="/command">Open workspace <ArrowUpRight size={18} /></a></Reveal></section>
    </main>
    <footer className="bb-landing-footer"><a href="/" aria-label="BreachBay home"><Brand compact /></a><span>Source evidence. Human decisions. Verified effects.</span><div><a href="https://github.com/richmondazadze/breachbay" target="_blank" rel="noopener noreferrer">Source <ArrowUpRight size={14} /></a><a href="/command">Workspace <ArrowUpRight size={14} /></a></div></footer>
  </div></MotionConfig>;
}
