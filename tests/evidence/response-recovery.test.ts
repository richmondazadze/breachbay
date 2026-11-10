/** Real process restart and outage exercise, restricted to a temporary loopback application. */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { executeApplication, previewApplication } from "../../src/lib/response/local-application";
import { canDispatchResponse } from "../../src/lib/response/authorization";
import type { IncidentSnapshot } from "../../src/lib/contracts";
import type { OperationalResponse, OperationalTarget } from "../../src/lib/response/contract";
import { canonical, sha256 } from "../../spacetimedb/src/hash";

test("outage is unconfirmed; restart recovers durable receipt; scope withdrawal prevents dispatch", { timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "breachbay-response-"));
  const previous = process.env.BREACHBAY_RESPONSE_CONNECTOR_FILE;
  const socket = createServer().listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>(resolve => socket.close(() => resolve()));
  let application: ChildProcess | undefined;
  async function start() {
    application = spawn("python3", ["tools/lab/application.py", "--directory", directory, "--port", String(port)], { cwd: resolve("."), stdio: ["ignore", "pipe", "pipe"] });
    await Promise.race([once(application.stdout!, "data"), once(application, "exit").then(() => { throw new Error("Application exited before listening"); })]);
  }
  async function stop() {
    if (application && application.exitCode === null && application.signalCode === null) {
      const closed = once(application, "exit"); application.kill("SIGTERM"); await closed;
    }
  }
  try {
    await start();
    process.env.BREACHBAY_RESPONSE_CONNECTOR_FILE = join(directory, "connector.json");
    const { preview, connector } = await previewApplication("local-recovery");
    const id = randomUUID();
    const response: OperationalResponse = { id, incidentId: preview.incidentId, targetId: "target", operation: "DISABLE_APPLICATION_LOGIN", expectedTargetVersion: 1, expectedStateVersion: preview.observation.version, instanceId: preview.observation.instanceId, payloadDigest: "", previewJson: canonical(preview), evidenceIds: ["log"], rationale: "Owned integration", requestedBy: "requester", approvalBy: "commander", approvalExpiresAt: new Date(Date.now() + 900000).toISOString(), status: "EXECUTING", version: 3, executionId: `${id}:execution`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    response.payloadDigest = sha256(canonical({ incidentId: response.incidentId, targetId: response.targetId, operation: response.operation, targetVersion: 1, stateVersion: response.expectedStateVersion, instanceId: response.instanceId, previewDigest: sha256(response.previewJson), evidence: [{ id: "log", version: 1, sha256: "a".repeat(64) }], rationale: response.rationale }));
    const target = { id: "target", connectorId: connector.id, active: true, version: 1, instanceId: response.instanceId } as OperationalTarget;
    const snapshot = { incident: { id: response.incidentId, status: "INVESTIGATING" }, evidence: [{ id: "log", version: 1, redactedSha256: "a".repeat(64) }], operationalTargets: [target], operationalResponses: [response], memberships: [{ userId: "commander", role: "COMMANDER", active: true, capabilities: ["APPROVE"] }, { userId: "requester", role: "INVESTIGATOR", active: true, capabilities: ["PROPOSE"] }] } as unknown as IncidentSnapshot;
    assert(canDispatchResponse(snapshot, response, Date.now()));
    const applied = await executeApplication(response, connector.id, () => canDispatchResponse(snapshot, response, Date.now()));
    assert.equal(applied.result.status, "VERIFIED_SUCCESS");
    await stop();
    const outage = await executeApplication(response, connector.id, false);
    assert.equal(outage.result.status, "UNCONFIRMED"); assert.equal(outage.result.receipt, null);
    await start();
    const recovered = await executeApplication(response, connector.id, false);
    assert.equal(recovered.result.status, "VERIFIED_SUCCESS");
    assert.deepEqual(recovered.result.receipt, applied.result.receipt);
    assert.equal(recovered.result.observation?.version, applied.result.observation?.version);
    const next = { ...response, id: randomUUID(), executionId: randomUUID(), operation: "ENABLE_APPLICATION_LOGIN" as const, expectedStateVersion: recovered.result.observation!.version };
    snapshot.operationalTargets = [{ ...target, active: false, version: 2 }];
    assert(!canDispatchResponse(snapshot, response, Date.now()));
    const denied = await executeApplication(next, connector.id, () => canDispatchResponse(snapshot, next, Date.now()));
    assert.equal(denied.result.status, "UNCONFIRMED"); assert.equal(denied.result.receipt, null);
    assert.equal(denied.result.observation?.version, recovered.result.observation?.version);
    assert.equal(denied.result.observation?.loginEnabled, false);
    snapshot.operationalTargets = [target];
    assert(!canDispatchResponse(snapshot, response, Date.now() + 1000000));
    snapshot.evidence[0].version++;
    assert(!canDispatchResponse(snapshot, response, Date.now()));
  } finally {
    await stop();
    if (previous === undefined) delete process.env.BREACHBAY_RESPONSE_CONNECTOR_FILE; else process.env.BREACHBAY_RESPONSE_CONNECTOR_FILE = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
