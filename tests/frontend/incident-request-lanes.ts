import test from "node:test";
import assert from "node:assert/strict";
import { createIncidentRequestLanes } from "../../src/hooks/incident-request-lanes";

test("a pending investigation permits cancellation and subsequent collaboration while ordinary mutations stay serialized", () => {
  const lanes = createIncidentRequestLanes();
  const investigation = lanes.begin("investigation", true)!;
  assert.equal(lanes.begin("investigation", true), null);
  const cancellation = lanes.begin("mutation", true)!;
  assert.ok(cancellation);
  assert.equal(lanes.begin("mutation", true), null);
  assert.equal(lanes.finish(cancellation), true);
  const collaboration = lanes.begin("mutation", true)!;
  assert.ok(collaboration);
  assert.equal(lanes.isCurrent(investigation), true);
  assert.equal(lanes.finish(collaboration), true);
  assert.equal(lanes.finish(investigation), true);
});
test("late long-request completion cannot clear a newer mutation or a new session's investigation", () => {
  const lanes = createIncidentRequestLanes();
  const oldInvestigation = lanes.begin("investigation", true)!;
  const mutation = lanes.begin("mutation", true)!;
  assert.equal(lanes.finish(oldInvestigation), true);
  assert.equal(lanes.isCurrent(mutation), true);
  const previousSession = lanes.begin("investigation", true)!;
  lanes.reset();
  const newSession = lanes.begin("investigation", true)!;
  assert.equal(lanes.isCurrent(previousSession), false);
  assert.equal(lanes.finish(previousSession), false);
  assert.equal(lanes.isCurrent(newSession), true);
  assert.equal(lanes.finish(mutation), false);
});
test("disconnected requests are denied and only the current ticket can release its lane", () => {
  const lanes = createIncidentRequestLanes();
  assert.equal(lanes.begin("investigation", false), null);
  assert.equal(lanes.begin("mutation", false), null);
  const ticket = lanes.begin("investigation", true)!;
  assert.equal(lanes.finish({ ...ticket }), false);
  assert.equal(lanes.begin("investigation", true), null);
});
