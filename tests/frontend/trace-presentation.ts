import test from "node:test";
import assert from "node:assert/strict";
import { providerCallDetails, traceDetails } from "../../src/hooks/trace-presentation";
const providerBase = { providerCallId: "11111111-1111-4111-8111-111111111111", step: 7, mode: "final_json", endpoint: "https://example.com/v1/chat/completions", classification: "SYNTHETIC", usageSource: "reported", monetaryCost: "UNKNOWN", outcome: "completed", durationMs: 123, promptTokens: 0, completionTokens: 10, totalTokens: 10 };
test("provider metadata preserves genuine zero counts and failed finalization usage without leaking payloads", () => {
  const data = providerCallDetails({ type: "provider_call_failed", dataJson: JSON.stringify({ ...providerBase, outcome: "failed", code: "INVALID_MODEL_OUTPUT", finishReason: "length", prompt: "HIDDEN_PROMPT", credentials: "HIDDEN_CREDENTIAL", requestHeaders: { Authorization: "HIDDEN_HEADER" }, responseBody: "HIDDEN_BODY" }) });
  assert.equal(data?.promptTokens, 0); assert.equal(data?.completionTokens, 10); assert.equal(data?.code, "INVALID_MODEL_OUTPUT"); assert.equal(data?.finishReason, "length"); assert.equal(data?.mode, "final_json");
  assert.doesNotMatch(JSON.stringify(data), /HIDDEN_|credentials|responseBody|requestHeaders/);
});
test("unavailable usage remains absent; estimates never become reported token consumption", () => {
  const usageEstimate = { promptTokensUpperBound: 50, completionTokensUpperBound: 100, totalTokensUpperBound: 150, method: "UTF8_REQUEST_BYTES_PLUS_OVERHEAD", basis: "REQUEST_BUDGET_CEILING" };
  const estimate = providerCallDetails({ type: "provider_call_started", dataJson: JSON.stringify({ ...providerBase, outcome: "started", usageSource: "estimated", usageEstimate }) });
  assert.equal(estimate?.usageEstimate?.totalTokensUpperBound, 150); assert.equal(estimate?.promptTokens, undefined); assert.equal(estimate?.completionTokens, undefined); assert.equal(estimate?.durationMs, undefined);
  const unavailable = providerCallDetails({ type: "provider_call_completed", dataJson: JSON.stringify({ ...providerBase, usageSource: "unavailable", usageEstimate }) });
  assert.equal(unavailable?.promptTokens, undefined); assert.equal(unavailable?.usageEstimate, undefined);
});
test("provider allowlist rejects unsafe endpoint, identity, outcome, scope and invalid numerical attribution", () => {
  for (const change of [{ endpoint: "https://user:secret@example.com/api" }, { endpoint: "https://example.com/api?key=secret" }, { endpoint: "http://example.com/api" }, { endpoint: "https://example.com/api#secret" }, { providerCallId: "body-id" }, { classification: "RESTRICTED" }, { durationMs: 120001 }, { outcome: "started" }, { step: 8 }, { monetaryCost: 0.1 }, { promptTokens: -1, completionTokens: 1.5, totalTokens: 10000001 }]) assert.equal(providerCallDetails({ type: "provider_call_completed", dataJson: JSON.stringify({ ...providerBase, ...change }) }), undefined);
  assert.equal(providerCallDetails({ type: "provider_call_started", dataJson: JSON.stringify({ ...providerBase, outcome: "started" }) }), undefined);
  assert.equal(providerCallDetails({ type: "provider_call_failed", dataJson: JSON.stringify({ ...providerBase, outcome: "failed", code: "raw-error-body" }) }), undefined);
});

test("trace renderer discards prompts, arguments and unsupported payload fields", () => {
  const data = traceDetails(JSON.stringify({ prompt: "do not show", objective: "do not show", arguments: { token: "synthetic" }, toolCallId: "call-1", step: 2, argumentsDigest: "a".repeat(64), providerLatencyMs: 15, distinctTools: ["a", "b", "c"] }));
  assert.equal(data.toolCallId, "call-1"); assert.equal(data.step, 2); assert.equal(data.providerLatencyMs, 15); assert.equal(data.distinctToolsCount, 3);
  assert.equal(JSON.stringify(data).includes("do not show"), false); assert.equal(JSON.stringify(data).includes("synthetic"), false);
});
test("citation packet preserves historical version/hash, and derivative excerpts are bounded", () => {
  const result = traceDetails(JSON.stringify({ result: [{ id: "e-1", version: 2, sha256: "b".repeat(64), excerpt: "x".repeat(2500) }, { id: "asset-1", state: "ISOLATED" }] }));
  assert.equal(result.citations.length, 1); assert.equal(result.citations[0].version, 2); assert.equal(result.citations[0].sha256, "b".repeat(64)); assert.equal(result.citations[0].excerpt?.length, 2000);
});
test("malformed, oversized and invalid typed values fail closed", () => {
  for (const json of ["not-json", "x".repeat(60001), "[]", "null"]) assert.deepEqual(traceDetails(json), { citations: [] });
  const result = traceDetails(JSON.stringify({ argumentsDigest: "bad", providerLatencyMs: -1, step: "2", error: { code: "FORBIDDEN", message: "raw prompt omitted" } }));
  assert.equal(result.argumentsDigest, undefined); assert.equal(result.providerLatencyMs, undefined); assert.equal(result.step, undefined); assert.equal(result.failureCode, "FORBIDDEN");
});
