"use client";
import { useState, type ReactNode } from "react";
import type { Incident } from "@/lib/contracts";
import { displayLabel } from "./ui/labels";
import { Button } from "./ui/button";

export function IncidentHeading({ incident, actions }: { incident: Pick<Incident, "id" | "title" | "description" | "classification" | "severity" | "status">; actions?: ReactNode }) {
  const [copyStatus, setCopyStatus] = useState("");
  const shortId = incident.id.length > 24 ? `${incident.id.slice(0, 12)}…${incident.id.slice(-8)}` : incident.id;
  return <header className="page-heading live-incident-heading">
    <div className="incident-heading-content">
      <div className="incident-heading-meta">
        <span>{displayLabel(incident.classification)}</span>
        <details className="incident-id-details"><summary title={incident.id}>Incident ID · {shortId}</summary>
          <code className="canonical-incident-id">{incident.id}</code>
          <Button type="button" variant="outline" size="sm" onClick={async () => {
            try { await navigator.clipboard.writeText(incident.id); setCopyStatus("Incident ID copied."); }
            catch { setCopyStatus("Select and copy the full incident ID above."); }
          }}>Copy incident ID</Button>
          {copyStatus && <p role="status">{copyStatus}</p>}
        </details>
      </div>
      <h1>{incident.title}</h1>
      <details className="bb-incident-summary"><summary>Incident summary</summary><p>{incident.description}</p></details>
    </div>
    <div className="incident-heading-actions">
      {actions}
      <span className="severity-chip" data-status={incident.status}>{displayLabel(incident.severity)} · {displayLabel(incident.status)}</span>
    </div>
  </header>;
}
