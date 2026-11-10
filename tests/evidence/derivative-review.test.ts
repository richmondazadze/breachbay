import test from "node:test";
import assert from "node:assert/strict";
import { reviewLogDerivative } from "../../src/lib/evidence/derivative-review";

const host = `asset_${"a".repeat(64)}`, peer = `asset_${"b".repeat(64)}`;
const first = { line: 2, timestamp: "2026-11-09T15:00:02Z", eventType: "auth.login", host, sourceHost: peer, destinationHost: host, outcome: "failure" };
const second = { line: 5, timestamp: "2026-11-09T15:00:01Z", eventType: "http.request", host, sourceHost: peer, destinationHost: host, outcome: "success", httpStatus: 200, httpMethod: "GET", bytes: 0 };
const payload = (events: unknown[], extra = {}) => JSON.stringify({ schema: "breachbay.observations.v1", events, ...extra });

test("review preserves source order and every observed value despite out-of-order timestamps", () => {
  const review = reviewLogDerivative(payload([first, second]))!;
  assert.deepEqual(review.events, [first, second]);
  assert.equal(review.start, "2026-11-09T15:00:01.000Z");
  assert.equal(review.end, "2026-11-09T15:00:02.000Z");
  assert.equal(review.hostCount, 2);
  assert.deepEqual(review.counts, { "http.request": 1, "auth.login": 1, "network.connection": 0, "database.query": 0 });
});

test("unsupported content never gets a partial summary that could conceal fields from review", () => {
  for (const content of ["not JSON", payload([first], { note: "unreviewed extra field" }), payload([{ ...first, message: "extra field" }]), payload([first, { ...second, httpStatus: 999 }]), payload([{ ...first, host: "unredacted.example.com" }]), payload([first, first]), payload([]), payload(Array.from({ length: 101 }, (_, index) => ({ ...first, line: index + 1 })))]) {
    assert.equal(reviewLogDerivative(content), null);
  }
});
