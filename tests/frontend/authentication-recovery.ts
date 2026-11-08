import test from "node:test";
import assert from "node:assert/strict";
import { authenticationRecovery } from "../../src/hooks/authentication-recovery";

test("recent authentication denial directs a new human sign-in", () => {
  const guidance = authenticationRecovery({ code: "UNAUTHENTICATED", message: "Recent authentication required" });
  assert.match(guidance!, /recent sign-in/);
  assert.match(guidance!, /Sign out and sign in again/);
  assert.match(guidance!, /review the current server state before retrying/);
  assert.doesNotMatch(guidance!, /refresh|skipCache|automatic/i);
});

test("authentication recovery does not substitute sign-in for authorization or approval", () => {
  assert.equal(authenticationRecovery({ code: "FORBIDDEN", message: "Recent authentication required" }), null);
  assert.equal(authenticationRecovery({ code: "APPROVAL_EXPIRED", message: "Approval expired" }), null);
  assert.equal(authenticationRecovery(null), null);
  assert.match(authenticationRecovery({ code: "UNAUTHENTICATED", message: "Expired or invalid session" })!, /restore your authenticated session/);
});
