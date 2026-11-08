import test from "node:test";
import assert from "node:assert/strict";
import { emptyAuditFilters, filterAuditEvents, sortAuditEvents } from "../../src/hooks/audit-presentation";
import type { AuditEvent } from "../../src/lib/contracts";
const event = (id: string, createdAt: string, actorId = "commander", verb = "attachEvidence"): AuditEvent => ({ id, incidentId: "synthetic", createdAt, actorId, verb, objectId: "evidence-1", correlationId: "reference-1", detail: "Synthetic evidence attached", hash: "a".repeat(64), previousHash: "" });
const rows = [event("later", "2026-11-08T06:04:27.000Z"), event("tie-b", "2026-11-08T06:02:38.000Z", "service", "recordToolRun"), event("tie-a", "2026-11-08T00:02:38.000-06:00"), event("middle", "2026-11-08T06:03:51.000Z")];
test("chronology orders instants and equal-time IDs without mutating subscriptions", () => {
  assert.deepEqual(sortAuditEvents(rows).map(e => e.id), ["tie-a", "tie-b", "middle", "later"]);
  assert.equal(rows[0].id, "later");
  assert.deepEqual(filterAuditEvents(rows, { ...emptyAuditFilters, order: "newest" }).map(e => e.id), ["later", "middle", "tie-b", "tie-a"]);
});
test("actor/type/reference/time filters combine with explicit UTC inclusive bounds", () => {
  assert.deepEqual(filterAuditEvents(rows, { ...emptyAuditFilters, actor: "commander", verb: "attachEvidence", query: "REFERENCE-1", from: "2026-11-08T06:02:38", to: "2026-11-08T06:03:51" }).map(e => e.id), ["tie-a", "middle"]);
  assert.equal(filterAuditEvents(rows, { ...emptyAuditFilters, query: "missing" }).length, 0);
  assert.equal(filterAuditEvents(rows, { ...emptyAuditFilters, from: "2026-11-09T00:00", to: "2026-11-08T00:00" }).length, 0);
});
