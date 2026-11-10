import test from "node:test";
import assert from "node:assert/strict";
import { recordedApplicationEffect, newestApplicationResponses } from "../../src/hooks/application-effect-presentation";
import type { OperationalResponse, ResponseResult } from "../../src/lib/response/contract";

const response = { id: "response-one", incidentId: "incident-one", executionId: "execution-one", payloadDigest: "digest-one", instanceId: "application-one", createdAt: "2026-01-01T12:00:00Z", status: "VERIFIED_SUCCESS" } as OperationalResponse;
const result: ResponseResult = { kind: "RESULT", incidentId: response.incidentId, responseId: response.id, executionId: response.executionId!, payloadDigest: response.payloadDigest, connectorId: "connector-one", status: "VERIFIED_SUCCESS", observation: { instanceId: response.instanceId, version: 8, loginEnabled: false, observedAt: "2026-01-01T12:01:00Z" }, receipt: { requestId: response.executionId!, requestDigest: "request-digest", applied: true, code: "APPLIED", beforeVersion: 7, afterVersion: 8, instanceId: response.instanceId, loginEnabled: false, recordedAt: "2026-01-01T12:00:59Z" }, loginProbeStatus: 403, healthStatus: 200, observedAt: "2026-01-01T12:01:00Z" };
const record = (change: Partial<ResponseResult> = {}) => ({ ...response, resultJson: JSON.stringify({ ...result, ...change }) });

test("recorded observations retain exact codes, time and receipt versions", () => {
  assert.deepEqual(recordedApplicationEffect(record()), { observedAt: result.observedAt, loginCode: 403, healthCode: 200, loginEnabled: false, observedVersion: 8, differentInstance: false, receiptVersions: { before: 7, after: 8 } });
});
test("outage and unconfirmed outcomes do not infer a setting or version change", () => {
  const shown = recordedApplicationEffect({ ...record({ status: "UNCONFIRMED", receipt: null, observation: null, healthStatus: 503, loginProbeStatus: null }), status: "UNCONFIRMED" });
  assert(shown);
  assert.equal(shown.loginEnabled, null); assert.equal(shown.observedVersion, null);
  assert.equal(shown.receiptVersions, null); assert.equal(shown.loginCode, null); assert.equal(shown.healthCode, 503);
});
test("missing, malformed or differently bound records are not presented", () => {
  for (const candidate of [response, { ...response, resultJson: "{" }, record({ incidentId: "foreign" }), record({ responseId: "foreign" }), record({ executionId: "foreign" }), record({ payloadDigest: "foreign" }), record({ observedAt: "bad-date" })]) assert.equal(recordedApplicationEffect(candidate), null);
});
test("a replacement application instance cannot describe the reviewed target", () => {
  const shown = recordedApplicationEffect(record({ status: "UNCONFIRMED", observation: { ...result.observation!, instanceId: "replacement" }, receipt: { ...result.receipt!, instanceId: "replacement" } }));
  assert(shown?.differentInstance); assert.equal(shown.loginEnabled, null); assert.equal(shown.observedVersion, null); assert.equal(shown.receiptVersions, null);
});
test("response order follows recorded timestamps, not subscription arrival or IDs", () => {
  const newer = { ...response, id: "a-newer", createdAt: "2026-01-02T12:00:00Z" };
  const rows = [newer, response];
  assert.deepEqual(newestApplicationResponses(rows).map(r => r.id), [newer.id, response.id]);
  assert.deepEqual(newestApplicationResponses([...rows].reverse()), rows);
  assert.deepEqual(rows, [newer, response]);
});
