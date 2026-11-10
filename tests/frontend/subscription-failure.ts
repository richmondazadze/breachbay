import test from "node:test";
import assert from "node:assert/strict";
import { subscriptionFailureMessage } from "../../src/hooks/subscription-failure";

test("the initial CSP failure retains a safe diagnosis and requests an app reload", () => {
  const message = subscriptionFailureMessage(new EvalError("Arbitrary SDK details must be omitted"));
  assert.match(message, /CONNECTION_SCRIPT_POLICY/);
  assert.match(message, /Reload after the application update/);
  assert.doesNotMatch(message, /Arbitrary SDK|unsafe-eval|disable/i);
});
test("unknown SDK errors cannot expose connection arguments through the UI", () => {
  const message = subscriptionFailureMessage(new Error("configured endpoint https://example.invalid/?token=synthetic"));
  assert.doesNotMatch(message, /example|token|https/);
  assert.match(message, /retry automatically/);
  assert.doesNotMatch(message, /Sign in again/i);
  assert.equal(subscriptionFailureMessage(new Error("Sign in again to restore your session.")), "Sign in again to restore your session.");
});
