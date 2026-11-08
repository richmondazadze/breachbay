import test from "node:test";
import assert from "node:assert/strict";
import { traceDetails } from "../../src/hooks/trace-presentation";

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
