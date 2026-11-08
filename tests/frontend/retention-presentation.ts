import test from "node:test";
import assert from "node:assert/strict";
import { canEditRetention, retentionDraft, validRetentionDraft } from "../../src/hooks/retention-presentation";
import type { IncidentRetentionPolicy, IncidentSnapshot } from "../../src/lib/contracts";
const policy: IncidentRetentionPolicy = { id: "synthetic", incidentId: "synthetic", indefinite: true, minimumRetentionDays: 30, hold: false, version: 0 };
const snapshot = { incident: { id: "synthetic" }, memberships: [{ incidentId: "synthetic", userId: "human", active: true, role: "COMMANDER", capabilities: ["MANAGE_INCIDENT"] }] } as IncidentSnapshot;
test("preservation editing requires the assigned active human commander, never capability/admin alone", () => {
  assert.equal(canEditRetention(snapshot, "human"), true);
  assert.equal(canEditRetention(snapshot, "platform-admin"), false);
  for (const change of [{ active: false }, { role: "AI_SERVICE" }, { role: "INVESTIGATOR" }, { incidentId: "foreign" }]) assert.equal(canEditRetention({ ...snapshot, memberships: [{ ...snapshot.memberships[0], ...change }] } as IncidentSnapshot, "human"), false);
});
test("policy revision, bounded minimum and audited reason are required independently of scenario", () => {
  const draft = retentionDraft(policy);
  assert.equal(validRetentionDraft(draft, policy, "Human preservation review"), true);
  assert.equal(validRetentionDraft(draft, { ...policy, version: 1 }, "Human review"), false);
  for (const days of ["", "0", "3651", "1.5", "Infinity", "NaN"]) assert.equal(validRetentionDraft({ ...draft, days }, policy, "Human review"), false);
  for (const days of ["1", "3650"]) assert.equal(validRetentionDraft({ ...draft, days, hold: true }, policy, "Human review"), true);
  assert.equal(validRetentionDraft(draft, policy, " "), false);
  assert.equal(validRetentionDraft(draft, policy, "x".repeat(1001)), false);
});
