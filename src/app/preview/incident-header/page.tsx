import { IncidentHeading } from "@/components/incident-heading";
export default function IncidentHeaderPreview() {
  return <main className="connected-main live-command">
    <a className="text-button" href="/">← Synthetic preview</a>
    <p className="impact-warning">Synthetic header fixture. No session, incident subscription, export or operational action is connected.</p>
    <IncidentHeading incident={{ id: `inc_${"0123456789abcdef".repeat(4)}`, title: "BreachBay synthetic credential-compromise case with a long responder-defined incident title", description: "Synthetic layout check with a representative canonical ID. Investigate workstation credential misuse, application and jump-host routes to the critical database, and customer portal dependency impact.", classification: "SYNTHETIC", severity: "CRITICAL", status: "CONTAINMENT_PENDING" }} actions={<div className="download-control"><button className="button button-outline" disabled>Export incident report</button></div>} />
  </main>;
}
