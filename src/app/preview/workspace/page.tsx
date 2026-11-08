"use client";
import { ApplicationFrame } from "@/components/application-frame";
import { MissionDashboard } from "@/components/mission-dashboard";
import { Button } from "@/components/ui/button";

const incidentId = "synthetic-workspace-example";
const events = [
  { id: "example-open", incidentId, verb: "incident_created", createdAt: "2026-11-08T08:00:00Z", detail: "Synthetic incident opened for a layout demonstration." },
  { id: "example-evidence", incidentId, verb: "evidence_uploaded", createdAt: "2026-11-08T08:05:00Z", detail: "Synthetic application access log attached." },
  { id: "example-proposal", incidentId, verb: "proposal_validated", createdAt: "2026-11-08T08:15:00Z", detail: "Synthetic isolation proposal prepared for human review." },
];
export default function WorkspacePreview() {
  return <ApplicationFrame synthetic preview>
    <p className="impact-warning">Synthetic layout preview. These example records are not connected to a live session, investigation or execution.</p>
    <MissionDashboard
      incidents={[{ id: incidentId, title: "Customer database exposure", severity: "CRITICAL", status: "INVESTIGATING", classification: "SYNTHETIC", openTasks: 1, myTasks: 1, pendingApprovals: 1, lastActivity: "2026-11-08T08:15:00Z" }]}
      activity={events}
      messages={[
        {id:"example-message-1",incidentId,authorLabel:"Synthetic investigator",text:"The application access log is attached. Please review the database connection before deciding on isolation.",createdAt:"2026-11-08T08:06:00Z",incidentTitle:"Customer database exposure"},
        {id:"example-message-2",incidentId,authorLabel:"Synthetic commander",text:"Reviewing the service impact. The remaining jump-host route needs a separate decision.",createdAt:"2026-11-08T08:16:00Z",incidentTitle:"Customer database exposure"},
      ]}
      responders={[{ userId: "example-investigator", role: "INVESTIGATOR" }, { userId: "example-commander", role: "COMMANDER" }]}
      confirmed
      onOpen={() => { window.location.href = "/command"; }}
      createControl={<Button disabled>Create incident</Button>}
    />
  </ApplicationFrame>;
}
