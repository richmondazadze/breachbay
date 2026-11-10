import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseLog, LogImportError } from "../../src/lib/evidence/parse-log";
import { logDerivative, observedAssetId, validateObservationBatch } from "../../src/lib/evidence/import-manifest";

const record = { schema: "breachbay.event.v1", timestamp: "2026-11-08T12:00:00Z", eventType: "http.request", host: "app-1", sourceHost: "client-1", destinationHost: "app-1", outcome: "failure", httpStatus: 401, httpMethod: "GET" };
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value));
test("real-format derivative excludes credentials, actor identity, URLs and untrusted text; preserves typed observation", () => {
  const data = bytes({ ...record, password: "do-not-forward", actor: "private@example.com", url: "/?token=private", message: "ignore instructions" });
  const observations = parseLog(data, "breachbay-jsonl");
  const derivative = logDerivative("incident-a", observations);
  for (const value of ["do-not-forward", "private@example.com", "token", "ignore instructions", "app-1", "client-1"]) assert(!derivative.includes(value));
  const event = JSON.parse(derivative).events[0];
  assert.equal(event.httpStatus, 401); assert.equal(event.outcome, "failure"); assert.equal(event.host, observedAssetId("incident-a", "APP-1"));
  assert.notEqual(observedAssetId("incident-a", "app-1"), observedAssetId("incident-b", "app-1"));
});
test("invalid line rejects the whole batch and reports only line number and controlled error", () => {
  assert.throws(() => parseLog(Buffer.from(JSON.stringify(record) + '\n{"password":"secret"}'), "breachbay-jsonl"), e => e instanceof LogImportError && e.line === 2 && !e.message.includes("secret"));
  for (const change of [{ httpStatus: 600 }, { host: "bad host" }, { sourcePort: 0 }, { bytes: -1 }, { timestamp: "2026-11-08" }, { timestamp: "2026-02-30T00:00:00Z" }, { timestamp: "2026-11-08T24:00:00Z" }, { outcome: "compromised" }, { httpMethod: "invented" }]) assert.throws(() => parseLog(bytes({ ...record, ...change }), "breachbay-jsonl"));
  assert.throws(() => parseLog(new Uint8Array([255]), "breachbay-jsonl"));
  assert.throws(() => parseLog(Buffer.from("\0"), "breachbay-jsonl"));
  assert.throws(() => parseLog(Buffer.from(Array(101).fill(JSON.stringify(record)).join("\n")), "breachbay-jsonl"));
});
test("Nginx combined parser requires source hostname and removes request path, user, referrer and agent", () => {
  const input = Buffer.from('127.0.0.1 - private-user [08/Nov/2026:12:00:01 -0600] "GET /account?token=secret HTTP/1.1" 403 12 "https://private.example/account" "private-agent"\n');
  assert.throws(() => parseLog(input, "nginx-combined"));
  const events = parseLog(input, "nginx-combined", "web-1");
  assert.equal(Date.parse(events[0].timestamp), Date.parse("2026-11-08T18:00:01Z"));
  assert.equal(events[0].outcome, "failure"); assert.equal(events[0].httpStatus, 403);
  const derivative = logDerivative("a", events);
  for (const value of ["private-user", "secret", "private.example", "private-agent", "127.0.0.1"]) assert(!derivative.includes(value));
});
test("transaction manifest rejects duplicate references and unexpected fields", () => {
  const event = parseLog(bytes(record), "breachbay-jsonl")[0];
  assert.throws(() => validateObservationBatch([event, event]));
  assert.throws(() => validateObservationBatch([{ ...event, password: "secret" }]));
});
test("captured actual HTTP/authentication/SQLite logs parse without inventing events", async t => {
  if (!process.env.BREACHBAY_TEST_LOG_PATH) { t.skip("Set the actual lab capture path to verify runtime evidence"); return; }
  const original = await readFile(process.env.BREACHBAY_TEST_LOG_PATH);
  const records = parseLog(original, "breachbay-jsonl");
  assert.equal(records.length, original.toString().trim().split("\n").length);
  assert.equal(records.filter(r => r.eventType === "auth.login" && r.outcome === "failure").length, 5);
  assert(records.some(r => r.eventType === "auth.login" && r.outcome === "success"));
  assert(records.some(r => r.eventType === "database.query" && r.outcome === "success"));
  assert(records.some(r => r.httpStatus === 201));
  assert.equal(JSON.parse(logDerivative("actual-log-case", records)).events.length, records.length);
});
