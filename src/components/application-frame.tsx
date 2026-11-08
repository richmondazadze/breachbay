"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ThemeControl } from "./theme";
import { LayoutDashboard, Network, FileText, Search, MessagesSquare, ChevronRight, X } from "./ui/icons";

export const incidentSections = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "evidence", label: "Evidence", icon: FileText },
  { id: "investigation", label: "Investigation", icon: Search },
  { id: "responses", label: "Responses", icon: Network },
  { id: "reports", label: "Reports", icon: FileText },
] as const;

export function ApplicationFrame({ children, title = "Mission Control", active = "mission", onNavigate, actions, synthetic = false, preview = false }: {
  children: ReactNode; title?: string; active?: string; onNavigate?: (section: string) => void; actions?: ReactNode; synthetic?: boolean; preview?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => { if (mobileOpen && !dialog.current?.open) dialog.current?.showModal(); else if (!mobileOpen) dialog.current?.close(); }, [mobileOpen]);
  const navigate = (section: string) => { onNavigate?.(section); setMobileOpen(false); };
  const navigation = <>
    <a href="/" className="bb-brand" aria-label="BreachBay home"><img src="/brand/harbor.svg" width="28" height="28" alt="" /><span>BreachBay</span></a>
    <div className="bb-nav-group"><span className="bb-nav-caption">Workspace</span>
      {onNavigate && preview ? <button className={active === "mission" ? "bb-nav active" : "bb-nav"} onClick={() => navigate("mission")} title="Mission Control"><LayoutDashboard size={18}/><span>Mission Control</span></button> : <a className={active === "mission" ? "bb-nav active" : "bb-nav"} aria-current={active === "mission" ? "page" : undefined} href="/command" title="Mission Control"><LayoutDashboard size={18}/><span>Mission Control</span></a>}
    </div>
    {onNavigate && <div className="bb-nav-group"><span className="bb-nav-caption">Incident workspace</span>{incidentSections.map(({id, label, icon: Icon}) => <button key={id} className={active === id ? "bb-nav active" : "bb-nav"} aria-current={active === id ? "page" : undefined} title={label} onClick={() => navigate(id)}><Icon size={18}/><span>{label}</span></button>)}</div>}
    {onNavigate && <div className="bb-nav-group"><span className="bb-nav-caption">Tools & people</span><button className={active === "graph" ? "bb-nav active" : "bb-nav"} title="Topology & replay" onClick={() => navigate("graph")}><Network size={18}/><span>Topology & replay</span></button><button className={active === "collaboration" ? "bb-nav active" : "bb-nav"} title="Team & collaboration" onClick={() => navigate("collaboration")}><MessagesSquare size={18}/><span>Team & collaboration</span></button></div>}
    <div className="bb-sidebar-footer"><div className="bb-boundary"><strong>{preview ? "Synthetic preview" : synthetic ? "Synthetic incident" : "Independent command"}</strong><p>{preview ? "No live session or execution." : synthetic ? "Responses change the modeled scenario, not production systems." : "Identity, evidence and human approval stay incident scoped."}</p></div><a className="bb-nav" href="/sign-in" title="Responder account"><span>Responder account</span><ChevronRight size={16}/></a></div>
  </>;
  return <div className="bb-app" data-collapsed={collapsed}>
    <a className="skip-link" href={`#${id}-content`}>Skip to workspace</a>
    <aside className="bb-sidebar" aria-label="Workspace navigation">{navigation}</aside>
    <div className="bb-body"><header className="bb-topbar"><div className="bb-breadcrumb"><button className="bb-sidebar-toggle" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}><LayoutDashboard size={18}/></button><button className="bb-mobile-toggle" aria-label="Open workspace navigation" aria-haspopup="dialog" onClick={() => setMobileOpen(true)}><LayoutDashboard size={18}/></button><span>Workspace</span><ChevronRight size={14}/><strong>{title}</strong></div><div className="bb-topbar-actions"><ThemeControl/>{actions}</div></header><main className="connected-main live-command bb-workspace" id={`${id}-content`}>{children}</main></div>
    <dialog ref={dialog} className="bb-mobile-navigation" aria-label="Workspace navigation" onCancel={() => setMobileOpen(false)} onClose={() => setMobileOpen(false)} onKeyDown={event => { if (event.key !== "Tab") return; const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)')); const first = controls[0], last = controls.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }}><button className="bb-nav-close" autoFocus aria-label="Close workspace navigation" onClick={() => setMobileOpen(false)}><X size={20}/></button>{navigation}</dialog>
  </div>;
}
