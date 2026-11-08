"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ThemeControl } from "./theme";
import { motion } from "motion/react";
import { useInterfaceMotion } from "@/hooks/use-interface-motion";
import { LayoutDashboard, Compass, ClipboardList, Layers, Network, FileText, Search, MessagesSquare, PanelLeft, Menu, UserRound, ChevronRight, X } from "./ui/icons";

export const incidentSections = [
  { id: "overview", label: "Overview", icon: Compass },
  { id: "evidence", label: "Evidence", icon: Layers },
  { id: "investigation", label: "Investigation", icon: Search },
  { id: "responses", label: "Responses", icon: ClipboardList },
  { id: "reports", label: "Reports", icon: FileText },
] as const;

export function ApplicationFrame({ children, title = "Mission Control", active = "mission", onNavigate, actions, synthetic = false, preview = false }: {
  children: ReactNode; title?: string; active?: string; onNavigate?: (section: string) => void; actions?: ReactNode; synthetic?: boolean; preview?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const desktopTrigger = useRef<HTMLButtonElement>(null);
  const { instant } = useInterfaceMotion();
  const id = useId();
  useEffect(() => {
    const panel = dialog.current;
    if (mobileOpen && !panel?.open) panel?.showModal();
    else if (!mobileOpen && panel?.open) {
      panel.close();
      const trigger = window.matchMedia("(max-width: 800px)").matches ? mobileTrigger.current : desktopTrigger.current;
      trigger?.focus({ preventScroll: true });
    }
  }, [mobileOpen]);
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const desktop = window.matchMedia("(min-width: 801px)");
    const change = () => { if (desktop.matches) setMobileOpen(false); };
    desktop.addEventListener("change", change);
    return () => { document.body.style.overflow = previous; desktop.removeEventListener("change", change); };
  }, [mobileOpen]);
  const navigate = (section: string) => { onNavigate?.(section); setMobileOpen(false); };
  const navigation = <>
    <a href="/" className="bb-brand" aria-label="BreachBay home"><img src="/brand/harbor.svg" width="28" height="28" alt="" /><span>BreachBay</span></a>
    <div className="bb-nav-group"><span className="bb-nav-caption">Workspace</span>
      {onNavigate && preview ? <button className={active === "mission" ? "bb-nav active" : "bb-nav"} aria-label="Mission Control" aria-current={active === "mission" ? "page" : undefined} data-label="Mission Control" onClick={() => navigate("mission")} title="Mission Control"><LayoutDashboard size={18}/><span>Mission Control</span></button> : <a className={active === "mission" ? "bb-nav active" : "bb-nav"} aria-label="Mission Control" aria-current={active === "mission" ? "page" : undefined} data-label="Mission Control" href="/command" title="Mission Control"><LayoutDashboard size={18}/><span>Mission Control</span></a>}
    </div>
    {onNavigate && <div className="bb-nav-group"><span className="bb-nav-caption">Incident workspace</span>{incidentSections.map(({id, label, icon: Icon}) => <button key={id} className={active === id ? "bb-nav active" : "bb-nav"} aria-label={label} data-label={label} aria-current={active === id ? "page" : undefined} title={label} onClick={() => navigate(id)}><Icon size={18}/><span>{label}</span></button>)}</div>}
    {onNavigate && <div className="bb-nav-group"><span className="bb-nav-caption">Tools & people</span><button className={active === "graph" ? "bb-nav active" : "bb-nav"} aria-label="Topology & replay" data-label="Topology & replay" title="Topology & replay" onClick={() => navigate("graph")}><Network size={18}/><span>Topology & replay</span></button><button className={active === "collaboration" ? "bb-nav active" : "bb-nav"} aria-label="Team & collaboration" data-label="Team & collaboration" title="Team & collaboration" onClick={() => navigate("collaboration")}><MessagesSquare size={18}/><span>Team & collaboration</span></button></div>}
    <div className="bb-sidebar-footer"><div className="bb-boundary"><strong>{preview ? "Synthetic preview" : synthetic ? "Synthetic incident" : "Independent command"}</strong><p>{preview ? "No live session or execution." : synthetic ? "Responses change the modeled scenario, not production systems." : "Identity, evidence and human approval stay incident scoped."}</p></div><a className="bb-nav" href="/sign-in" title="Responder account" aria-label="Responder account" data-label="Responder account"><UserRound size={18}/><span>Responder account</span></a></div>
  </>;
  return <div className="bb-app" data-collapsed={collapsed} data-instant={instant}>
    <a className="skip-link" href={`#${id}-content`}>Skip to workspace</a>
    <aside className="bb-sidebar" aria-label="Workspace navigation"><span className="bb-sidebar-surface" aria-hidden="true"/>{navigation}</aside>
    <motion.div className="bb-body" layout={instant ? false : "position"} transition={{layout:{duration:.22,ease:[.77,0,.175,1]}}}><header className="bb-topbar"><div className="bb-breadcrumb"><button ref={desktopTrigger} className="bb-sidebar-toggle" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}><PanelLeft size={18}/></button><button ref={mobileTrigger} className="bb-mobile-toggle" aria-label="Open workspace navigation" aria-haspopup="dialog" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><Menu size={18}/></button><span>Workspace</span><ChevronRight size={14}/><strong>{title}</strong></div><div className="bb-topbar-actions"><ThemeControl/>{actions}</div></header><main className="connected-main live-command bb-workspace" id={`${id}-content`}>{children}</main></motion.div>
    <dialog ref={dialog} className="bb-mobile-navigation" aria-label="Workspace navigation" onCancel={event => { event.preventDefault(); setMobileOpen(false); }} onClose={() => setMobileOpen(false)} onClick={event => { if(event.target !== event.currentTarget) return; const bounds=event.currentTarget.getBoundingClientRect(); if(event.clientX<bounds.left || event.clientX>bounds.right || event.clientY<bounds.top || event.clientY>bounds.bottom) setMobileOpen(false); }} onKeyDown={event => { if (event.key !== "Tab") return; const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)')); const first = controls[0], last = controls.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }}><button className="bb-nav-close" autoFocus aria-label="Close workspace navigation" onClick={() => setMobileOpen(false)}><X size={20}/></button>{navigation}</dialog>
  </div>;
}
