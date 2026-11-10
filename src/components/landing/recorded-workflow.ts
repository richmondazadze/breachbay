/** Public-safe aggregates from the owned local run on 2026-11-10, not a live connection. */
export const recordedRun = {
  date: "2026-11-10",
  label: "10 Nov 2026",
  events: { http: 19, login: 10, database: 7 },
  modelCalls: 4,
  readTools: 3,
  findings: 2,
  reviewedFindings: 1,
  receiptMatches: 2,
} as const;

export const accessRecords = [
  { label: "Before", title: "Application access was open.", detail: "A saved session could read notes. New logins and health checks succeeded.", login: 200, session: 200, health: 200, version: 17 },
  { label: "Disabled", title: "Access stopped. Health stayed up.", detail: "After human approval, new login and the saved session were denied.", login: 403, session: 403, health: 200, version: 18 },
  { label: "Restored", title: "New access. Old sessions revoked.", detail: "A separately approved recovery enabled new sessions. The saved session stayed blocked.", login: 200, session: 403, health: 200, version: 19 },
] as const;

export const recordedStages = [
  { label: "Source logs", title: "Start with an observed event.", detail: "An owned HTTP application produced real login, request and SQLite events. A human approved the pseudonymized derivative before NVIDIA could read it.", note: "Import source logs and review model access.", operation: "36 captured events, with their source preserved", time: "15:19 UTC", dateTime: "2026-11-10T15:19:14Z" },
  { label: "Investigate", title: "Trace the finding to its source.", detail: "Nemotron made four model calls and used three read tools. It returned two cited observations with uncertainty, without approving or executing a response.", note: "Inspect the model’s tools, citations and uncertainty.", operation: "NVIDIA investigation completed", time: "15:21 UTC", dateTime: "2026-11-10T15:21:00Z" },
  { label: "Human review", title: "Review the fact. Bound the action.", detail: "The commander verified the historical login only and reviewed the local target. A separate investigator requested the disable; the commander approved its specific impact.", note: "A separate commander reviews the proposed effect.", operation: "Historical finding reviewed; disable separately approved", time: "16:08 UTC", dateTime: "2026-11-10T16:08:23Z" },
  { label: "Disable", title: "Check the effect outside the interface.", detail: "The approved action blocked new logins and revoked the saved session. Independent HTTP checks confirmed both denials while the health endpoint stayed available.", note: "Execute the approved action and check the application.", operation: "Application disable verified", time: "16:08 UTC", dateTime: "2026-11-10T16:08:34Z" },
  { label: "Restore", title: "Recover access without reviving old sessions.", detail: "A fresh investigator proposal and separate human approval restored new logins. A new session could read notes; the pre-disable session still received an access denial.", note: "Review recovery separately and verify session revocation.", operation: "Restoration and old-session denial verified", time: "16:11 UTC", dateTime: "2026-11-10T16:11:35Z" },
  { label: "Report", title: "Keep the evidence behind the outcome.", detail: "The protected report records the investigation, human review, distinct requester and approver, and both effects. Both execution receipts match the application’s saved receipts.", note: "Preserve evidence, approvals and verified results.", operation: "Protected report exported and receipts checked", time: "16:12 UTC", dateTime: "2026-11-10T16:12:16Z" },
] as const;
