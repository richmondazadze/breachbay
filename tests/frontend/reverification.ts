import test from "node:test";
import assert from "node:assert/strict";
import { recentlyVerified } from "../../src/lib/backend/reverification";
import { authenticatedAt } from "../../src/lib/backend/clerk-token";

test("reverification retains the conservative JWT first-factor age and 15-minute boundary", () => {
  const now = 2000000000;
  assert.equal(recentlyVerified(authenticatedAt({ iat: now, fva: [0, -1] }), now), true);
  assert.equal(recentlyVerified(authenticatedAt({ iat: now, fva: [14, -1] }), now), true);
  assert.equal(recentlyVerified(authenticatedAt({ iat: now, fva: [14, -1] }), now + 1), false);
  assert.equal(recentlyVerified(authenticatedAt({ iat: now, fva: [15, -1] }), now), false);
  // Issuing a fresh token is insufficient when its original factor remains old.
  assert.equal(recentlyVerified(authenticatedAt({ iat: now, fva: [60, 0] }), now), false);
});

test("missing, future and malformed first-factor timestamps cannot count as verification", () => {
  const now = 2000000000;
  for (const at of [0, -1, NaN, Infinity, now + 1]) assert.equal(recentlyVerified(at, now), false);
  for (const fva of [undefined, [], [-1, 0], ["0", 0], [NaN, 0]]) {
    assert.equal(recentlyVerified(authenticatedAt({ iat: now, fva }), now), false);
  }
});
