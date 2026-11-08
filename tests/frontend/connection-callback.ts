import test from "node:test";
import assert from "node:assert/strict";
import { currentConnectionCallback } from "../../src/hooks/connection-callback";

test("an onApplied callback before connection adoption cannot publish an old cache", () => {
  const previous = {}, next = {};
  let current: object | undefined = previous;
  let candidate: object | undefined;
  let calls = 0;
  const callback = currentConnectionCallback(() => true, () => current, () => candidate, () => calls++);
  callback(); // SDK onApplied during awaited setup, before result is assigned.
  assert.equal(calls, 0);
  candidate = next;
  callback(); // Even assigned, a connection is not current until adoption.
  assert.equal(calls, 0);
  current = next;
  callback();
  assert.equal(calls, 1);
});

test("late old-connection callbacks and callbacks after unsubscribe are ignored", () => {
  const previous = {}, next = {};
  let current = previous;
  let active = true;
  let calls = 0;
  const callback = currentConnectionCallback(() => active, () => current, () => previous, () => calls++);
  callback();
  current = next;
  callback();
  current = previous;
  active = false;
  callback();
  assert.equal(calls, 1);
});
