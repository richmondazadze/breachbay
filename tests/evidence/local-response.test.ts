/** Actual loopback HTTP/SQLite integration; metadata is test scaffolding, event logs are real. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFile, writeFile, mkdir, stat, open } from "node:fs/promises";
import { dirname, join } from "node:path";
import { executeApplication, localConnector, previewApplication } from "../../src/lib/response/local-application";
import type { OperationalResponse, RealOperation } from "../../src/lib/response/contract";
import { verifyResponseProof } from "../../spacetimedb/src/response-proof";
import { parseLog } from "../../src/lib/evidence/parse-log";
test("actual application sessions, CAS effects, independent verification, idempotent recovery and genuine log capture", { skip: !process.env.BREACHBAY_RESPONSE_CONNECTOR_FILE }, async () => {
  const c = await localConnector();
  const logPath = join(dirname(process.env.BREACHBAY_RESPONSE_CONNECTOR_FILE!), "application.jsonl");
  const startOffset = await stat(logPath).then(s => s.size, () => 0);
  async function http(path: string, body?: unknown, token?: string) {
    const r = await fetch(c.endpoint + path, { method: body ? "POST" : "GET", headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, data: await r.json() };
  }
  assert.equal((await http("/health")).status, 200);
  assert.equal((await http("/control/status")).status, 401);
  const before = (await http("/control/status", undefined, c.controlToken)).data;
  if (!before.loginEnabled) assert.equal((await http("/control/access", { requestId: `test-precondition-${randomUUID()}`, operation: "ENABLE_APPLICATION_LOGIN", expectedVersion: before.version, instanceId: before.instanceId }, c.controlToken)).data.applied, true);
  for(let i=0;i<5;i++) assert.equal((await http("/login", { password: randomUUID() })).status, 401);
  const session = await http("/login", { password: c.probePassword }); assert.equal(session.status, 200);
  assert.equal((await http("/notes", { content: "Written by the actual integration exercise" }, session.data.session)).status, 201);
  assert.equal((await http("/notes", undefined, session.data.session)).status, 200);
  const start = (await previewApplication("actual-adapter-check")).preview;
  assert.equal(start.observation.loginEnabled, true);
  const response = (operation: RealOperation, stateVersion: number): OperationalResponse => {
    const id = `response_${randomUUID()}`;
    return { id, incidentId: "actual-adapter-check", targetId: "adapter-integration-target", operation, expectedTargetVersion: 1, expectedStateVersion: stateVersion, instanceId: start.observation.instanceId, payloadDigest: "d".repeat(64), previewJson: JSON.stringify(start), evidenceIds: [], rationale: "Isolated adapter integration", requestedBy: "integration-requester", status: "EXECUTING", version: 3, executionId: `${id}:execution`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  };
  const disable = response("DISABLE_APPLICATION_LOGIN", start.observation.version);
  const first = await executeApplication(disable, c.id, true);
  assert.equal(first.result.status, "VERIFIED_SUCCESS");
  assert.equal(first.result.loginProbeStatus, 403); assert.equal(first.result.healthStatus, 200);
  assert.equal((await http("/notes", undefined, session.data.session)).status, 403);
  assert.equal(first.result.observation?.version, start.observation.version + 1);
  assert.deepEqual(verifyResponseProof(first.proofJson, first.signature, c.signingKey), first.result);
  const recovered = await executeApplication(disable, c.id, false);
  assert.equal(recovered.result.status, "VERIFIED_SUCCESS"); assert.deepEqual(recovered.result.receipt, first.result.receipt);
  assert.equal(recovered.result.observation?.version, start.observation.version + 1, "Retry repeated the account mutation");
  const stale = await executeApplication(response("DISABLE_APPLICATION_LOGIN", start.observation.version), c.id, true);
  assert.equal(stale.result.status, "VERIFIED_FAILED"); assert.equal(stale.result.receipt?.code, "VERSION_CONFLICT");
  const enable = response("ENABLE_APPLICATION_LOGIN", first.result.observation!.version);
  const restored = await executeApplication(enable, c.id, true);
  assert.equal(restored.result.status, "VERIFIED_SUCCESS"); assert.equal(restored.result.loginProbeStatus, 200);
  assert.equal((await http("/notes", undefined, session.data.session)).status, 403, "Recovery revived a revoked session");
  // Capture only this exercise; repeated runs must not exceed the import event limit.
  const source = await open(logPath, "r");
  let bytes: Buffer;
  try {
    const length = (await source.stat()).size - startOffset;
    assert(length > 0 && length <= 1_000_000, "Unexpected exercise log size");
    bytes = Buffer.alloc(length);
    const read = await source.read(bytes, 0, length, startOffset);
    assert.equal(read.bytesRead, length);
  } finally { await source.close(); }
  const observations = parseLog(bytes, "breachbay-jsonl");
  assert(observations.some(e=>e.eventType==="database.query")); assert(observations.some(e=>e.eventType==="auth.login"&&e.outcome==="failure"));
  assert(!bytes.toString().includes(c.controlToken)); assert(!bytes.toString().includes(c.probePassword)); assert(!bytes.toString().includes(session.data.session));
  const output=process.env.BREACHBAY_LAB_REPORT_DIR;
  if(output) { await mkdir(output,{recursive:true,mode:0o700}); await writeFile(join(output,"application.jsonl"),bytes,{mode:0o600}); await writeFile(join(output,"adapter-result.json"),JSON.stringify({ proof:"Actual loopback application effects and independent HTTP checks; adapter integration, not authenticated deployed E2E",disable,enable,first:first.result,restored:restored.result,events:observations.length,sha256:createHash("sha256").update(bytes).digest("hex")},null,2),{mode:0o600}); }
});
