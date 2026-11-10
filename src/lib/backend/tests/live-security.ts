/** Real loopback-only Spacetime integration. Ephemeral signing keys must live outside the repo. */
import assert from "node:assert/strict";
import {installCspSafeCodecs} from "../csp-codecs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { SignJWT, importPKCS8, importSPKI, jwtVerify } from "jose";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { DbConnection } from "../generated";
import { sha256, canonical } from "../../../../spacetimedb/src/hash";
import { parseLog } from "../../evidence/parse-log";
import { logDerivative } from "../../evidence/import-manifest";
const endpoint = process.env.BREACHBAY_TEST_ENDPOINT ?? "http://127.0.0.1:3100";
const database =
  process.env.BREACHBAY_TEST_DATABASE ?? "breachbay-security-smoke";
const keyPath = process.env.BREACHBAY_TEST_KEY_PATH;
assert.equal(
  new URL(endpoint).hostname,
  "127.0.0.1",
  "Tests are restricted to loopback",
);
assert.ok(
  keyPath,
  "Set BREACHBAY_TEST_KEY_PATH to an ephemeral external PKCS8 key",
);
const meta = () => ({
  idempotencyKey: randomUUID(),
  correlationId: randomUUID(),
});
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function eventually(check: () => boolean, message: string) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await delay(25);
  }
  assert.fail(message);
}
async function main() {
  if(process.env.BREACHBAY_TEST_CSP_CODECS==="1")installCspSafeCodecs();
  assert.equal(sha256("abc"), createHash("sha256").update("abc").digest("hex"));
  assert.equal(
    sha256("Unicode 🔐"),
    createHash("sha256").update("Unicode 🔐").digest("hex"),
  );
  const privateKey = await importPKCS8(
    await readFile(keyPath!, "utf8"),
    "ES256",
  );
  const publicKey = await importSPKI(
    await readFile(
      process.env.BREACHBAY_TEST_PUBLIC_KEY_PATH ??
        "/tmp/breachbay-security-smoke/public.pem",
      "utf8",
    ),
    "ES256",
  );
  const clients: DbConnection[] = [];
  const validation = createServer(async (req, res) => {
    try {
      const raw = req.headers.authorization;
      if (!raw?.startsWith("Bearer ")) throw new Error("missing");
      const { payload } = await jwtVerify(raw.slice(7), publicKey, {
        issuer: "localhost",
        audience: "breachbay-test",
      });
      if (
        payload.azp !== "http://127.0.0.1:3200" ||
        typeof payload.sid !== "string"
      )
        throw new Error("invalid");
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          issuer: payload.iss,
          subject: payload.sub,
          audience: "breachbay-test",
          sessionId: payload.sid,
          expiresAt: payload.exp,
          originalIssuedAt: payload.iat,
          authenticatedAt:
            Number(payload.iat) -
            (Number((payload.fva as number[])[0]) + 1) * 60,
        }),
      );
    } catch {
      res.statusCode = 401;
      res.end("{}");
    }
  });
  await new Promise<void>((resolve) =>
    validation.listen(3111, "127.0.0.1", resolve),
  );
  async function token(
    subject: string,
    audience = "breachbay-test",
    age = 0,
    life = 600,
  ) {
    return new SignJWT({
      sid: `synthetic-session-${randomUUID()}`,
      fva: [Math.floor(age / 60), -1],
      azp: "http://127.0.0.1:3200",
      name: `Synthetic ${subject}`,
    })
      .setProtectedHeader({ alg: "ES256" })
      .setIssuer("localhost")
      .setAudience(audience)
      .setSubject(subject)
      .setIssuedAt()
      .setExpirationTime(`${life}s`)
      .sign(privateKey);
  }
  async function connect(
    subject: string,
    audience = "breachbay-test",
    age = 0,
    life = 600,
  ) {
    const jwt = await token(subject, audience, age, life);
    const connection = await new Promise<DbConnection>((resolve, reject) => {
      DbConnection.builder()
        .withUri(endpoint)
        .withDatabaseName(database)
        .withToken(jwt)
        .onConnect((conn) => resolve(conn))
        .onConnectError((_ctx, error) => reject(error))
        .build();
    });
    clients.push(connection);
    const lease =
      randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
    await connection.procedures.openReadSession({ lease, token: jwt });
    await new Promise<void>((resolve, reject) =>
      connection
        .subscriptionBuilder()
        .onApplied(() => resolve())
        .onError((ctx) => reject(ctx.event ?? new Error("Subscription denied")))
        .subscribe(
          [
            "SELECT * FROM my_sessions",
            "SELECT * FROM my_profile",
            "SELECT * FROM my_receipts",
            "SELECT * FROM scoped_incidents",
            "SELECT * FROM scoped_retention_policies",
            "SELECT * FROM scoped_reports",
            "SELECT * FROM scoped_memberships",
            "SELECT * FROM scoped_evidence",
            "SELECT * FROM scoped_investigations",
            "SELECT * FROM scoped_tool_runs",
            "SELECT * FROM scoped_findings",
            "SELECT * FROM scoped_stream_events",
            "SELECT * FROM scoped_assets",
            "SELECT * FROM scoped_operational_targets",
            "SELECT * FROM scoped_operational_responses",
            "SELECT * FROM scoped_edges",
            "SELECT * FROM scoped_graph_reviews",
            "SELECT * FROM scoped_scenarios",
            "SELECT * FROM scoped_scenario_history",
            "SELECT * FROM scoped_messages",
            "SELECT * FROM scoped_tasks",
            "SELECT * FROM scoped_proposals",
            "SELECT * FROM scoped_simulations",
            "SELECT * FROM scoped_approvals",
            "SELECT * FROM scoped_verifications",
            "SELECT * FROM scoped_audit_events",
          ].map((q) =>
            q.endsWith("my_profile") || q.endsWith("my_sessions")
              ? q
              : `${q}('${lease}')`,
          ),
        ),
    );
    return { connection, jwt, lease };
  }
  const alice = await connect("alice");
  const bob = await connect("bob");
  const observer = await connect("observer");
  const outsider = await connect("outsider");
  const ai = await connect("ai");
  const admin = await connect("dave");
  const a = alice.connection,
    b = bob.connection,
    o = observer.connection,
    x = outsider.connection,
    service = ai.connection;
  async function result(
    conn: DbConnection,
    call: () => Promise<void>,
    m: { correlationId: string },
  ) {
    await call();
    await eventually(
      () =>
        [...conn.db.myReceipts.iter()].some(
          (r) => r.correlationId === m.correlationId,
        ),
      "Missing committed command receipt",
    );
    return [...conn.db.myReceipts.iter()].find(
      (r) => r.correlationId === m.correlationId,
    )!.objectId;
  }
  if (process.env.BREACHBAY_SECURITY_SMOKE_SCOPE === "production-ingestion") {
    assert(process.env.BREACHBAY_TEST_LOG_PATH, "Actual captured log path required");
    const raw = await readFile(process.env.BREACHBAY_TEST_LOG_PATH);
    const observations = parseLog(raw, "breachbay-jsonl");
    const make = meta();
    const caseId = await result(a, () => a.reducers.createIncident({ ...make, title: "Actual application log review", description: "Logs captured from actual HTTP/authentication and SQLite work in an owned local process", severity: "HIGH", classification: "INTERNAL", scenarioId: "evidence-driven" }), make);
    await eventually(() => [...a.db.scopedIncidents.iter()].some(i => i.id === caseId), "Empty incident missing");
    for (const table of [a.db.scopedEvidence, a.db.scopedAssets, a.db.scopedEdges, a.db.scopedScenarios]) assert.equal([...table.iter()].filter(r => r.incidentId === caseId).length, 0, "Operational creation seeded data");
    const getUser = (c: DbConnection) => [...c.db.myProfile.iter()][0].id;
    for (const [c, role] of [[b, "INVESTIGATOR"], [o, "OBSERVER"], [service, "AI_SERVICE"]] as const) await a.reducers.setMember({ ...meta(), incidentId: caseId, userId: getUser(c), role, active: true });
    const derivative = logDerivative(caseId, observations), originalHash = createHash("sha256").update(raw).digest("hex");
    const m = meta();
    const payload = { ...m, incidentId: caseId, title: "Actual application.jsonl", source: "Owned local application capture", classification: "INTERNAL", sha256: originalHash, redactedSha256: sha256(derivative), redactedContent: derivative, observationsJson: JSON.stringify(observations), storageRef: `private-evidence:${originalHash}` };
    await assert.rejects(x.reducers.ingestLogEvidence(payload), /FORBIDDEN/);
    await assert.rejects(o.reducers.ingestLogEvidence(payload), /FORBIDDEN/);
    await assert.rejects(service.reducers.ingestLogEvidence(payload), /FORBIDDEN/);
    await assert.rejects(b.reducers.ingestLogEvidence({ ...payload, redactedSha256: "0".repeat(64) }), /INVALID_INPUT/);
    assert.equal([...a.db.scopedAssets.iter()].filter(r => r.incidentId === caseId).length, 0, "Rejected import partially created assets");
    const evidenceId = await result(b, () => b.reducers.ingestLogEvidence(payload), m);
    await eventually(() => [...a.db.scopedEvidence.iter()].some(e => e.id === evidenceId), "Import did not propagate live");
    const e = [...a.db.scopedEvidence.iter()].find(e => e.id === evidenceId)!;
    assert.equal(e.modelApproved, false); assert.equal(e.sha256, originalHash); assert.equal(e.redactedContent, derivative);
    assert.equal([...service.db.scopedEvidence.iter()].filter(e => e.incidentId === caseId).length, 0, "Service read unapproved logs");
    const assets = [...a.db.scopedAssets.iter()].filter(e => e.incidentId === caseId);
    assert(assets.length > 0); assert(assets.every(e => e.state === "UNKNOWN"));
    assert([...a.db.scopedEdges.iter()].filter(e => e.incidentId === caseId).every(e => e.verificationStatus === "HYPOTHESIS"));
    await b.reducers.ingestLogEvidence(payload);
    const retry = meta(); await result(b, () => b.reducers.ingestLogEvidence({ ...payload, ...retry }), retry);
    assert.equal([...a.db.scopedEvidence.iter()].filter(e => e.incidentId === caseId).length, 1, "Duplicate original produced another evidence record");
    await assert.rejects(b.reducers.ingestLogEvidence({ ...payload, ...meta(), source: "Different collection claim" }), /IDEMPOTENCY_CONFLICT/);
    const approval = { ...meta(), incidentId: caseId, evidenceId, expectedVersion: e.version, approved: true, reason: "Reviewed the exact pseudonymous derivative from the owned lab capture" };
    await assert.rejects(b.reducers.approveEvidenceForModel(approval), /FORBIDDEN/);
    await assert.rejects(service.reducers.approveEvidenceForModel(approval), /FORBIDDEN/);
    await a.reducers.approveEvidenceForModel(approval);
    await eventually(() => [...service.db.scopedEvidence.iter()].some(e => e.id === evidenceId && e.modelApproved), "Approved derivative not exposed to scoped service");
    if (process.env.BREACHBAY_TEST_OPERATIONAL_PROVIDER === "1") {
      const { investigateOperational } = await import("../../ai/operational-investigation");
      const { operationalModelContext } = await import("../model-log-context");
      const { snapshotFromConnection } = await import("../client");
      const started = meta(), canonicalRun = await result(b, () => b.reducers.startInvestigation({ ...started, incidentId: caseId, objective: "Review approved actual authentication and database log observations, cite the evidence, distinguish observations from compromise and suggest next queries" }), started);
      const recorded: import("../../ai/investigation").InvestigationEvent[] = [];
      const ports: import("../../ai/investigation").InvestigationPorts = {
        loadContext: async () => { throw new Error("No synthetic context"); },
        loadOperationalContext: async () => operationalModelContext(snapshotFromConnection(service, caseId)!),
        submitProposal: async () => { throw new Error("Model may not execute or propose this response connector"); },
        persistEvent: async event => {
          const m = meta();
          if(event.type === "finding") {
            const f = event.data.finding as import("../../ai/evidence").Finding;
            await service.reducers.recordFinding({ ...m, incidentId: caseId, runId: canonicalRun, title: f.summary.slice(0,150), summary: f.summary, confidence: f.confidence, evidenceIds: f.evidenceIds, assetIds: [], unknowns: f.unknowns, recommendedNextQueries: f.recommendedNextQueries });
          }
          if(event.type === "tool_completed") {
            const d=event.data, ids=d.tool === "search_evidence" ? (d.result as {id:string}[]).map(e=>e.id) : [];
            const approved=[...service.db.scopedEvidence.iter()];
            await service.reducers.recordToolRun({ ...meta(), incidentId: caseId, runId: canonicalRun, tool: String(d.tool), argumentsDigest: String(d.argumentsDigest), toolCallId: String(d.toolCallId), providerLatencyMs: Number(d.providerLatencyMs), durationMs: Number(d.durationMs), resultJson: JSON.stringify(d.result), citationsJson: JSON.stringify(ids.map(id=>{const e=approved.find(e=>e.id===id)!;return{evidenceId:id,version:e.version,sha256:e.redactedSha256};})), failureCode: undefined, status: "COMPLETED", evidenceIds: ids, summary: "Validated approved operational read" });
          }
          await service.reducers.recordInvestigationEvent({ ...meta(), incidentId: caseId, runId: canonicalRun, type: event.type, provider: event.provider, model: event.model, tool: typeof event.data.tool === "string" ? event.data.tool : undefined, summary: undefined, dataJson: JSON.stringify(event.data) });
          recorded.push(event);
        },
      };
      const inferred = await investigateOperational(caseId, "Review the actual approved log observations with the evidence, asset graph and observation-count tools. Cite supported authentication and database observations, explain uncertainty and recommend next queries. Do not assert current compromise or propose actions.", ports);
      await eventually(() => [...a.db.scopedInvestigations.iter()].some(r=>r.id===canonicalRun&&r.status==="COMPLETED"), "Actual operational provider completion not persisted");
      assert.equal(inferred.proposalId,undefined);assert(inferred.findings.length>0);
      assert.equal([...a.db.scopedProposals.iter()].filter(p=>p.incidentId===caseId).length,0);
      assert(recorded.filter(e=>e.type.startsWith("provider_call")).every(e=>e.data.classification==="INTERNAL"));
      if(process.env.BREACHBAY_LAB_REPORT_DIR) {
        await mkdir(process.env.BREACHBAY_LAB_REPORT_DIR,{recursive:true,mode:0o700});
        await writeFile(`${process.env.BREACHBAY_LAB_REPORT_DIR}/database-provider-result.json`,JSON.stringify({proof:"Actual NVIDIA calls and SpacetimeDB persistence with test-only signed identities; not genuine Clerk/deployed E2E",canonicalRun,inferred,trace:recorded},null,2),{mode:0o600});
      }
      console.log("PASS real NVIDIA investigation over actual approved logs, actual SpacetimeDB tools/findings/planning/telemetry persistence and no AI execution");
    }
    if (process.env.BREACHBAY_RESPONSE_CONNECTOR_FILE) {
      const { previewApplication, signedResponse, executeApplication } = await import("../../response/local-application");
      const preview = await previewApplication(caseId);
      const registration = { ...meta(), incidentId: caseId, ...signedResponse(preview.preview, preview.connector.signingKey), name: preview.connector.name, owner: "Owned integration application", criticality: "HIGH", expectedVersion: 0, reason: "Reviewed actual producing-system log and signed application observation" };
      for (const denied of [b, service, x]) await assert.rejects(denied.reducers.registerOperationalTarget(registration), /FORBIDDEN/);
      await assert.rejects(a.reducers.registerOperationalTarget({ ...registration, signature: "0".repeat(64) }), /FORBIDDEN/);
      const targetId = await result(a, () => a.reducers.registerOperationalTarget(registration), registration);
      await eventually(() => [...b.db.scopedOperationalTargets.iter()].some(t => t.id === targetId), "Reviewed target did not propagate");
      assert.equal([...service.db.scopedOperationalTargets.iter()].length, 0, "AI service received human response targets");
      let target = [...a.db.scopedOperationalTargets.iter()].find(t => t.id === targetId)!;
      await a.reducers.registerOperationalTarget(registration);
      assert.equal([...a.db.scopedOperationalTargets.iter()].find(t => t.id === targetId)!.version, target.version, "Exact proof retry renewed target scope");
      const stalePreview = { ...preview.preview, observation: { ...preview.preview.observation, observedAt: new Date(Date.now() - 180000).toISOString() } };
      await assert.rejects(a.reducers.registerOperationalTarget({ ...registration, ...meta(), expectedVersion: target.version, ...signedResponse(stalePreview, preview.connector.signingKey) }), /VERSION_CONFLICT/);
      const sourceAsset = [...a.db.scopedAssets.iter()].find(asset => asset.id === target.assetId)!;
      assert.equal(sourceAsset.state, "UNKNOWN", "Target review invented host health"); assert.equal(sourceAsset.criticality, "HIGH"); assert(!sourceAsset.riskLabels.includes("CRITICALITY_UNREVIEWED"));
      const propose = async (operation: "DISABLE_APPLICATION_LOGIN" | "ENABLE_APPLICATION_LOGIN") => {
        const p = await previewApplication(caseId), m = meta();
        const args = { ...m, incidentId: caseId, targetId, operation, expectedTargetVersion: target.version, ...signedResponse(p.preview, p.connector.signingKey), evidenceIds: [evidenceId], rationale: "Reviewed actual application authentication outcomes and application access tradeoff" };
        await assert.rejects(service.reducers.proposeOperationalResponse(args), /FORBIDDEN/);
        return result(b, () => b.reducers.proposeOperationalResponse(args), m);
      };
      const responseId = await propose("DISABLE_APPLICATION_LOGIN");
      await eventually(() => [...a.db.scopedOperationalResponses.iter()].some(r => r.id === responseId), "Operational proposal missing");
      const row = () => [...a.db.scopedOperationalResponses.iter()].find(r => r.id === responseId)!;
      const approval = { ...meta(), incidentId: caseId, responseId, expectedVersion: row().version, decision: "APPROVE", reason: "Accept scoped application login/session disruption; health endpoint remains available" };
      for (const denied of [b, service, x]) await assert.rejects(denied.reducers.approveOperationalResponse(approval), /FORBIDDEN/);
      const staleCommander = (await connect("alice", "breachbay-test", 1200)).connection;
      await assert.rejects(staleCommander.reducers.approveOperationalResponse(approval), /UNAUTHENTICATED/);
      staleCommander.disconnect();
      await assert.rejects(a.reducers.claimOperationalResponse({ ...meta(), incidentId: caseId, responseId, expectedVersion: row().version }), /FORBIDDEN/);
      await a.reducers.approveOperationalResponse(approval);
      await eventually(() => row().status === "APPROVED", "Human response approval missing");
      await a.reducers.setMember({ ...meta(), incidentId: caseId, userId: getUser(b), role: "INVESTIGATOR", active: false });
      await assert.rejects(a.reducers.claimOperationalResponse({ ...meta(), incidentId: caseId, responseId, expectedVersion: row().version }), /FORBIDDEN/);
      await a.reducers.setMember({ ...meta(), incidentId: caseId, userId: getUser(b), role: "INVESTIGATOR", active: true });
      const claim = { ...meta(), incidentId: caseId, responseId, expectedVersion: row().version };
      await assert.rejects(service.reducers.claimOperationalResponse(claim), /FORBIDDEN/);
      await a.reducers.claimOperationalResponse(claim);
      await eventually(() => row().status === "EXECUTING", "Durable execution claim missing");
      await a.reducers.claimOperationalResponse(claim);
      assert.equal(row().executionId, `${responseId}:execution`);
      const executing = row() as unknown as import("../../response/contract").OperationalResponse;
      const observed = await executeApplication(executing, target.connectorId, true);
      assert.equal(observed.result.status, "VERIFIED_SUCCESS");
      const record = { ...meta(), incidentId: caseId, responseId, proofJson: observed.proofJson, signature: observed.signature };
      await assert.rejects(a.reducers.recordOperationalResult({ ...record, signature: "0".repeat(64) }), /FORBIDDEN/);
      await a.reducers.recordOperationalResult(record);
      await eventually(() => row().status === "VERIFIED_SUCCESS", "Signed independent response verification missing");
      const replay = await executeApplication(executing, target.connectorId, false);
      assert.deepEqual(replay.result.receipt, observed.result.receipt, "Receipt recovery changed effect identity");
      assert.equal(replay.result.observation?.version, observed.result.observation?.version, "Receipt recovery repeated mutation");
      const recoveryId = await propose("ENABLE_APPLICATION_LOGIN");
      await eventually(() => [...a.db.scopedOperationalResponses.iter()].some(r => r.id === recoveryId), "Recovery proposal missing");
      const recoveryRow = () => [...a.db.scopedOperationalResponses.iter()].find(r => r.id === recoveryId)!;
      await a.reducers.approveOperationalResponse({ ...meta(), incidentId: caseId, responseId: recoveryId, expectedVersion: recoveryRow().version, decision: "APPROVE", reason: "Restore new application logins; prior revoked sessions remain invalid" });
      await eventually(() => recoveryRow().status === "APPROVED", "Recovery approval missing");
      await a.reducers.claimOperationalResponse({ ...meta(), incidentId: caseId, responseId: recoveryId, expectedVersion: recoveryRow().version });
      await eventually(() => recoveryRow().status === "EXECUTING", "Recovery claim missing");
      const recovered = await executeApplication(recoveryRow() as unknown as import("../../response/contract").OperationalResponse, target.connectorId, true);
      assert.equal(recovered.result.status, "VERIFIED_SUCCESS");
      await a.reducers.recordOperationalResult({ ...meta(), incidentId: caseId, responseId: recoveryId, proofJson: recovered.proofJson, signature: recovered.signature });
      await eventually(() => recoveryRow().status === "VERIFIED_SUCCESS", "Recovery verification missing");
      await assert.rejects(a.reducers.withdrawOperationalResponse({ ...meta(), incidentId: caseId, responseId: recoveryId, expectedVersion: recoveryRow().version, reason: "Cannot withdraw an executed effect" }), /INVALID_TRANSITION/);
      const retiredResponseId = await propose("DISABLE_APPLICATION_LOGIN");
      const retiredRow = () => [...a.db.scopedOperationalResponses.iter()].find(r => r.id === retiredResponseId)!;
      await eventually(() => !!retiredRow(), "Scope test proposal missing");
      await a.reducers.approveOperationalResponse({ ...meta(), incidentId: caseId, responseId: retiredResponseId, expectedVersion: retiredRow().version, decision: "APPROVE", reason: "Exercise revocation before application dispatch" });
      await eventually(() => retiredRow().status === "APPROVED", "Scope test approval missing");
      const retire = { ...meta(), incidentId: caseId, targetId, expectedVersion: target.version, reason: "Remove application before dispatch" };
      for (const denied of [b, service, x]) await assert.rejects(denied.reducers.retireOperationalTarget(retire), /FORBIDDEN/);
      await a.reducers.retireOperationalTarget(retire);
      await a.reducers.retireOperationalTarget(retire);
      await eventually(() => ![...a.db.scopedOperationalTargets.iter()].find(t => t.id === targetId)!.active, "Target retirement missing");
      await assert.rejects(a.reducers.claimOperationalResponse({ ...meta(), incidentId: caseId, responseId: retiredResponseId, expectedVersion: retiredRow().version }), /VERSION_CONFLICT/);
      const withdrawal = { ...meta(), incidentId: caseId, responseId: retiredResponseId, expectedVersion: retiredRow().version, reason: "Target removed; withdraw unexecuted approval" };
      for (const denied of [service, x]) await assert.rejects(denied.reducers.withdrawOperationalResponse(withdrawal), /FORBIDDEN/);
      await b.reducers.withdrawOperationalResponse(withdrawal);
      await b.reducers.withdrawOperationalResponse(withdrawal);
      await eventually(() => retiredRow().status === "WITHDRAWN", "Approved response withdrawal missing");
      await assert.rejects(a.reducers.claimOperationalResponse({ ...meta(), incidentId: caseId, responseId: retiredResponseId, expectedVersion: retiredRow().version }), /FORBIDDEN/);
      assert.equal(retiredRow().executionId, undefined);
      const renewedPreview = await previewApplication(caseId);
      target = [...a.db.scopedOperationalTargets.iter()].find(t => t.id === targetId)!;
      await a.reducers.registerOperationalTarget({ ...registration, ...meta(), expectedVersion: target.version, ...signedResponse(renewedPreview.preview, renewedPreview.connector.signingKey), reason: "Explicit fresh review to restore application scope" });
      await eventually(() => [...a.db.scopedOperationalTargets.iter()].find(t => t.id === targetId)!.active, "Reviewed target reactivation missing");
      target = [...a.db.scopedOperationalTargets.iter()].find(t => t.id === targetId)!;
      const pendingId = await propose("DISABLE_APPLICATION_LOGIN");
      await eventually(() => [...a.db.scopedOperationalResponses.iter()].some(r => r.id === pendingId), "Pending withdrawal test missing");
      await a.reducers.withdrawOperationalResponse({ ...meta(), incidentId: caseId, responseId: pendingId, expectedVersion: 1, reason: "Commander withdraws pending proposal" });
      await eventually(() => [...a.db.scopedOperationalResponses.iter()].some(r => r.id === pendingId && r.status === "WITHDRAWN"), "Pending withdrawal missing");
      assert.equal((await previewApplication(caseId)).preview.observation.version, recovered.result.observation!.version, "Scope withdrawal caused an application effect");
      const report = meta(), reportId = await result(a, () => a.reducers.exportReport({ ...report, incidentId: caseId }), report);
      const exported = JSON.parse([...a.db.scopedReports.iter()].find(r => r.id === reportId)!.summary);
      assert.equal(exported.operationalTargets.length, 1); assert.equal(exported.operationalResponses.length, 4);
      assert.equal(exported.operationalResponses.filter((r: { status: string }) => r.status === "VERIFIED_SUCCESS").length, 2);
      assert.equal(exported.operationalResponses.filter((r: { status: string }) => r.status === "WITHDRAWN").length, 2);
      assert.equal([...a.db.scopedScenarios.iter()].filter(r => r.incidentId === caseId).length, 0, "Real response wrote simulator state");
      if (process.env.BREACHBAY_LAB_REPORT_DIR) {
        const { snapshotFromConnection } = await import("../client");
        await mkdir(process.env.BREACHBAY_LAB_REPORT_DIR, { recursive: true, mode: 0o700 });
        await writeFile(`${process.env.BREACHBAY_LAB_REPORT_DIR}/operational-snapshot.json`, JSON.stringify(snapshotFromConnection(a, caseId), null, 2), { mode: 0o600 });
        await writeFile(`${process.env.BREACHBAY_LAB_REPORT_DIR}/response-checks.json`, JSON.stringify({ checkedAt: new Date().toISOString(), proof: "Real loopback application, genuine captured logs, actual SpacetimeDB; test-only signed actor identities", exactProofRetry: true, stalePreviewDenied: true, retiredTargetDenied: true, approvedWithdrawal: true, pendingWithdrawal: true, executedWithdrawalDenied: true, freshReviewReactivated: true, verifiedEffects: 2, withdrawnResponses: 2 }, null, 2), { mode: 0o600 });
      }
      console.log("PASS actual SQLite application effects, separate-account scoped approval, durable idempotent execution, signed independent HTTP verification, AI/outsider denial and real response report");
    }
    await a.reducers.approveEvidenceForModel({ ...approval, ...meta(), expectedVersion: e.version + 1, approved: false, reason: "End model access after the verification" });
    await eventually(() => ![...service.db.scopedEvidence.iter()].some(e => e.id === evidenceId), "Revocation did not retract service data");
    await assert.rejects(a.reducers.approveEvidenceForModel({ ...approval, ...meta() }), /VERSION_CONFLICT/);
    for (const c of clients) c.disconnect();
    await new Promise<void>((resolve, reject) => validation.close(err => err ? reject(err) : resolve()));
    console.log("PASS actual captured logs, empty operational creation, atomic ingest, scoped live updates, no invented health, integrity denial, original deduplication and human-only model approval/revocation");
    return;
  }
  const create = meta();
  const createArgs={...create,title:"Synthetic security integration",description:"Loopback test fixture",severity:"CRITICAL",classification:"SYNTHETIC",scenarioId:"credential-compromise"};
  const incidentId = await result(a,()=>a.reducers.createIncident(createArgs),create);
  await eventually(()=>[...a.db.scopedTasks.iter()].some(task=>task.incidentId===incidentId),"Initial triage task missing from scoped subscription");
  const initialTasks=[...a.db.scopedTasks.iter()].filter(task=>task.incidentId===incidentId);
  assert.equal(initialTasks.length,1);
  const initialTask=initialTasks[0];
  const creator=[...a.db.myProfile.iter()][0].id;
  assert.equal(initialTask.assigneeId,creator);assert.equal(initialTask.state,"TODO");assert.equal(initialTask.version,1);
  assert.equal(initialTask.title,"Triage synthetic credential compromise");assert(initialTask.id);
  assert.equal(initialTask.createdAt,[...a.db.scopedIncidents.iter()].find(i=>i.id===incidentId)!.createdAt);
  assert([...a.db.scopedMemberships.iter()].some(m=>m.incidentId===incidentId && m.userId===creator && m.role==="COMMANDER" && m.active));
  const createReceipt=[...a.db.myReceipts.iter()].find(r=>r.correlationId===create.correlationId)!;
  assert.equal(createReceipt.objectId,incidentId);assert(createReceipt.auditEventId);
  const seeded={assets:[...a.db.scopedAssets.iter()].filter(row=>row.incidentId===incidentId).length,evidence:[...a.db.scopedEvidence.iter()].filter(row=>row.incidentId===incidentId).length,edges:[...a.db.scopedEdges.iter()].filter(row=>row.incidentId===incidentId).length};
  assert(seeded.assets>0&&seeded.evidence>0&&seeded.edges>0);
  await a.reducers.createIncident(createArgs);
  assert.equal([...a.db.scopedTasks.iter()].filter(task=>task.incidentId===incidentId).length,1);
  assert.equal([...a.db.myReceipts.iter()].filter(r=>r.id===createReceipt.id).length,1);
  assert.deepEqual({assets:[...a.db.scopedAssets.iter()].filter(row=>row.incidentId===incidentId).length,evidence:[...a.db.scopedEvidence.iter()].filter(row=>row.incidentId===incidentId).length,edges:[...a.db.scopedEdges.iter()].filter(row=>row.incidentId===incidentId).length},seeded);
  console.log("PASS real incident creation atomically exposes commander TODO/version1 triage task, seeded state and audited receipt; same-key replay adds no task");
  if(process.env.BREACHBAY_SECURITY_SMOKE_SCOPE==="initial-task"){
    for(const client of clients)client.disconnect();
    await new Promise<void>((resolve,reject)=>validation.close(error=>error?reject(error):resolve()));
    console.log("INITIAL TASK FOCUSED LIVE SMOKE PASSED (scheduler suite not run)");return;
  }
  const second = meta();
  const otherId = await result(
    a,
    () =>
      a.reducers.createIncident({
        ...second,
        title: "Synthetic isolated incident",
        description: "Isolation fixture",
        severity: "HIGH",
        classification: "SYNTHETIC",
        scenarioId: "credential-compromise",
      }),
    second,
  );
  const getUser = (conn: DbConnection) => [...conn.db.myProfile.iter()][0].id;
  for (const [conn, role] of [
    [b, "INVESTIGATOR"],
    [o, "OBSERVER"],
    [service, "AI_SERVICE"],
  ] as const)
    await a.reducers.setMember({
      ...meta(),
      incidentId,
      userId: getUser(conn),
      role,
      active: true,
    });
  await eventually(
    () => [...b.db.scopedIncidents.iter()].length === 1,
    "Membership did not propagate",
  );
  assert.equal([...b.db.scopedIncidents.iter()][0].id, incidentId);
  assert.equal(
    [...b.db.scopedEvidence.iter()].some((e) => e.incidentId === otherId),
    false,
  );
  assert.equal([...x.db.scopedIncidents.iter()].length, 0);
  assert.equal(
    [...admin.connection.db.myProfile.iter()][0].platformAdmin,
    true,
  );
  assert.equal([...admin.connection.db.scopedEvidence.iter()].length, 0);
  console.log(
    "PASS real incident-scoped views, separate authenticated users, outsider isolation",
  );
  if(process.env.BREACHBAY_SECURITY_SMOKE_SCOPE==="completion-gaps"){
    const retained = () => JSON.stringify({incident:[...a.db.scopedIncidents.iter()].find(i=>i.id===incidentId),evidence:[...a.db.scopedEvidence.iter()].filter(e=>e.incidentId===incidentId),assets:[...a.db.scopedAssets.iter()].filter(e=>e.incidentId===incidentId),edges:[...a.db.scopedEdges.iter()].filter(e=>e.incidentId===incidentId),scenarios:[...a.db.scopedScenarios.iter()].filter(e=>e.incidentId===incidentId),history:[...a.db.scopedScenarioHistory.iter()].filter(e=>e.incidentId===incidentId),proposals:[...a.db.scopedProposals.iter()].filter(e=>e.incidentId===incidentId),verifications:[...a.db.scopedVerifications.iter()].filter(e=>e.incidentId===incidentId)});
    const policy = () => [...a.db.scopedRetentionPolicies.iter()].find(p=>p.incidentId===incidentId)!;
    await eventually(()=>Boolean(policy()),"Initial retention policy missing");
    assert.equal(policy().indefinite,true);assert.equal(policy().minimumRetentionDays,30);assert.equal(policy().hold,false);assert.equal(policy().version,1);assert.equal(policy().updatedBy,getUser(a));
    await eventually(()=>[...b.db.scopedRetentionPolicies.iter()].some(p=>p.incidentId===incidentId),"Scoped reader did not receive retention settings");
    assert(![...x.db.scopedRetentionPolicies.iter()].some(p=>p.incidentId===incidentId));
    const before=retained();
    const change={...meta(),incidentId,indefinite:false,minimumRetentionDays:90,hold:true,expectedVersion:1,reason:"Synthetic case preservation review"};
    for(const denied of [b,o,service,x,admin.connection])await assert.rejects(denied.reducers.setIncidentRetentionPolicy(change),/FORBIDDEN/);
    const stale=(await connect("alice","breachbay-test",1200)).connection;
    await assert.rejects(stale.reducers.setIncidentRetentionPolicy(change),/UNAUTHENTICATED/);
    for(const minimumRetentionDays of [0,3651])await assert.rejects(a.reducers.setIncidentRetentionPolicy({...change,...meta(),minimumRetentionDays}),/INVALID_INPUT/);
    await assert.rejects(a.reducers.setIncidentRetentionPolicy({...change,...meta(),reason:" "}),/INVALID_INPUT/);
    const policyId=await result(a,()=>a.reducers.setIncidentRetentionPolicy(change),change);
    assert.equal(policyId,incidentId);
    await eventually(()=>policy().version===2,"Retention change not subscribed");
    assert.equal(policy().hold,true);assert.equal(policy().indefinite,false);assert.equal(policy().minimumRetentionDays,90);
    const receipt=[...a.db.myReceipts.iter()].find(r=>r.correlationId===change.correlationId)!;
    const audits=[...a.db.scopedAuditEvents.iter()].filter(e=>e.verb==="setIncidentRetentionPolicy");
    const changeAudit=audits.find(e=>e.id===receipt.auditEventId)!;
    const detail=JSON.parse(changeAudit.detail);assert.equal(detail.before.version,1);assert.equal(detail.after.version,2);assert.equal(detail.after.hold,true);assert.equal(detail.automaticDeletionImplemented,false);
    await a.reducers.setIncidentRetentionPolicy(change);
    assert.equal(policy().version,2);assert.equal([...a.db.scopedAuditEvents.iter()].filter(e=>e.verb==="setIncidentRetentionPolicy").length,audits.length);
    await assert.rejects(a.reducers.setIncidentRetentionPolicy({...change,...meta()}),/VERSION_CONFLICT/);
    await assert.rejects(a.reducers.setIncidentRetentionPolicy({...change,minimumRetentionDays:120}),/IDEMPOTENCY_CONFLICT/);
    assert.equal(retained(),before,"Settings changed retained incident/evidence/scenario/action state");
    console.log("PASS scoped human/recent-auth retention policy, bounds, immutable retained state, version/key conflicts and before/after audited receipt");

    let v=[...a.db.scopedIncidents.iter()].find(i=>i.id===incidentId)!.version;
    for(const status of ["TRIAGED","INVESTIGATING"]){await a.reducers.transitionIncident({...meta(),incidentId,status,reason:"Synthetic report fidelity preparation",expectedVersion:v});v++;}
    const evidenceId=[...a.db.scopedEvidence.iter()].find(e=>e.incidentId===incidentId && e.modelApproved)!.id;
    const assetId=[...a.db.scopedAssets.iter()].find(e=>e.incidentId===incidentId)!.id;
    const proposalMeta=meta();
    const proposalId=await result(b,()=>b.reducers.proposeAction({...proposalMeta,incidentId,investigationId:undefined,action:{type:"ISOLATE_SIMULATED_HOST",targetIds:[assetId]},rationale:"Synthetic manual proposal",evidenceIds:[evidenceId],assumptions:["Manual assumption"],uncertainty:["Manual unresolved question"],planningJson:undefined,expectedVersion:1}),proposalMeta);
    const runMeta=meta();
    const runId=await result(b,()=>b.reducers.startInvestigation({...runMeta,incidentId,objective:"Synthetic provider metadata and report validation"}),runMeta);
    await service.reducers.recordInvestigationEvent({...meta(),incidentId,runId,type:"run_started",provider:"SYNTHETIC_TEST",model:"synthetic-model",tool:undefined,summary:undefined,dataJson:undefined});
    const call={providerCallId:randomUUID(),step:0,mode:"tools",endpoint:"https://example.invalid/v1/chat/completions",classification:"SYNTHETIC",usageSource:"estimated",monetaryCost:"UNKNOWN",outcome:"started",usageEstimate:{promptTokensUpperBound:1000,completionTokensUpperBound:100,totalTokensUpperBound:1100,method:"UTF8_REQUEST_BYTES_PLUS_OVERHEAD",basis:"REQUEST_BUDGET_CEILING"}};
    const event=(type:string,data:unknown)=>({...meta(),incidentId,runId,type,provider:"SYNTHETIC_TEST",model:"synthetic-model",tool:undefined,summary:undefined,dataJson:JSON.stringify(data)});
    await assert.rejects(b.reducers.recordInvestigationEvent(event("provider_call_started",call)),/FORBIDDEN/);
    await assert.rejects(service.reducers.recordInvestigationEvent(event("provider_call_completed",{...call,outcome:"completed",durationMs:10})),/INVALID_TRANSITION/);
    await assert.rejects(service.reducers.recordInvestigationEvent(event("provider_call_started",{...call,classification:"RESTRICTED"})),/EVIDENCE_REDACTED/);
    const callStart=event("provider_call_started",{...call,prompt:"private synthetic prompt",headers:{token:"private synthetic token"}});
    await service.reducers.recordInvestigationEvent(callStart);
    await service.reducers.recordInvestigationEvent(callStart);
    await assert.rejects(service.reducers.recordInvestigationEvent(event("provider_call_started",call)),/INVALID_TRANSITION/);
    await assert.rejects(service.reducers.recordInvestigationEvent(event("provider_call_completed",{...call,outcome:"completed",durationMs:10,endpoint:"https://other.invalid/v1/chat/completions"})),/INVALID_INPUT/);
    const complete=event("provider_call_completed",{...call,outcome:"completed",durationMs:10,usageSource:"reported",promptTokens:100,completionTokens:10,totalTokens:110,finishReason:"tool_calls",response:"private synthetic response"});
    await service.reducers.recordInvestigationEvent(complete);
    await service.reducers.recordInvestigationEvent(complete);
    await assert.rejects(service.reducers.recordInvestigationEvent(event("provider_call_failed",{...call,outcome:"failed",durationMs:10,code:"MODEL_UNAVAILABLE"})),/INVALID_TRANSITION/);
    const failedCall={...call,providerCallId:randomUUID(),step:1};
    await service.reducers.recordInvestigationEvent(event("provider_call_started",failedCall));
    await service.reducers.recordInvestigationEvent(event("provider_call_failed",{...failedCall,outcome:"failed",durationMs:15,code:"MODEL_UNAVAILABLE",error:"private synthetic body"}));
    const truncatedCall={...call,providerCallId:randomUUID(),step:2};
    await service.reducers.recordInvestigationEvent(event("provider_call_started",truncatedCall));
    await service.reducers.recordInvestigationEvent(event("provider_call_failed",{...truncatedCall,outcome:"failed",durationMs:20,code:"INVALID_MODEL_OUTPUT",usageSource:"reported",promptTokens:100,completionTokens:40,totalTokens:140,finishReason:"length",response:"private truncated synthetic body"}));
    assert.equal([...a.db.scopedInvestigations.iter()].find(r=>r.id===runId)!.status,"RUNNING","Provider event fabricated run completion");
    const findingMeta=meta();
    const findingId=await result(service,()=>service.reducers.recordFinding({...findingMeta,incidentId,runId,title:"Synthetic accepted finding",summary:"Synthetic observed host communication",evidenceIds:[evidenceId],assetIds:[assetId],confidence:"HIGH",unknowns:["Finding unresolved question"],recommendedNextQueries:["Review route"]}),findingMeta);
    await a.reducers.acceptFinding({...meta(),incidentId,findingId,reason:"Synthetic evidence reviewed"});
    const reportMeta=meta();
    const reportId=await result(a,()=>a.reducers.exportReport({...reportMeta,incidentId}),reportMeta);
    await eventually(()=>[...a.db.scopedReports.iter()].some(r=>r.id===reportId),"Report not subscribed");
    const report=JSON.parse([...a.db.scopedReports.iter()].find(r=>r.id===reportId)!.summary);
    const action=report.actions.find((p:{id:string})=>p.id===proposalId);assert.deepEqual(action.assumptions,["Manual assumption"]);assert.deepEqual(action.uncertainty,["Manual unresolved question"]);assert.deepEqual(action.evidenceIds,[evidenceId]);assert.equal(action.planning,undefined);assert(action.payloadDigest);
    assert.equal(report.findings.find((f:{id:string})=>f.id===findingId).verificationStatus,"VERIFIED");
    assert.deepEqual(report.findings.find((f:{id:string})=>f.id===findingId).assetIds,[assetId]);
    const review=report.findingReviews.find((r:{findingId:string})=>r.findingId===findingId);assert.equal(review.reviewedBy,getUser(a));assert.equal(review.reason,"Synthetic evidence reviewed");assert(review.auditHash);
    assert(report.unknowns.includes("Manual unresolved question"));assert(report.unknowns.includes("Finding unresolved question"));assert.equal(report.retentionPolicy.version,2);
    assert.equal(report.providerCalls.length,6);assert.equal(report.providerCalls.filter((e:{type:string})=>e.type==="provider_call_completed").length,1);
    assert(!JSON.stringify(report.providerCalls).includes("private"));
    assert(report.providerCalls.some((e:{data:{totalTokens?:number}})=>e.data.totalTokens===110));
    assert.equal(report.providerCalls.find((e:{type:string})=>e.type==="provider_call_failed").data.totalTokens,undefined);
    const retainedWithActions=retained();
    await a.reducers.setIncidentRetentionPolicy({...meta(),incidentId,indefinite:true,minimumRetentionDays:3650,hold:false,expectedVersion:2,reason:"Resume indefinite preservation"});
    assert.equal(retained(),retainedWithActions,"Policy update deleted or rewrote evidence/actions/history");
    await a.reducers.setMember({...meta(),incidentId,userId:getUser(b),role:"INVESTIGATOR",active:false});
    await eventually(()=>![...b.db.scopedRetentionPolicies.iter()].some(p=>p.incidentId===incidentId),"Revoked membership retained policy rows");
    await assert.rejects(b.reducers.setIncidentRetentionPolicy({...change,...meta(),expectedVersion:3}),/FORBIDDEN/);
    console.log("PASS synthetic provider call pairing/attribution/redacted projection, report finding review/manual uncertainty and retained actions after policy/revocation");
    for(const client of clients)client.disconnect();
    await new Promise<void>((resolve,reject)=>validation.close(error=>error?reject(error):resolve()));
    console.log("COMPLETION GAPS FOCUSED LIVE SMOKE PASSED (no real provider call or scheduler suite)");return;
  }
  if(process.env.BREACHBAY_SECURITY_SMOKE_SCOPE==="graph-review"){
    const evidenceId=`${incidentId}:ev-login`,assetId=`${incidentId}:workstation`;
    const baselineScenario=canonical([...a.db.scopedScenarios.iter()].find(s=>s.incidentId===incidentId)!.state);
    const link=async(conn:DbConnection,fromId:string,toId:string)=>{const m=meta();return result(conn,()=>conn.reducers.linkGraphEdge({...m,incidentId,fromId,toId,type:"OBSERVED_ON",sourceEvidenceIds:[evidenceId],confidence:"HIGH"}),m);};
    const edgeId=await link(b,evidenceId,assetId);
    await eventually(()=>[...a.db.scopedEdges.iter()].some(e=>e.id===edgeId),"Hypothesis edge missing");
    const before=[...a.db.scopedEdges.iter()].find(e=>e.id===edgeId)!;
    const packet=JSON.parse(await a.procedures.readGraphEdgeReview({incidentId,edgeId}));
    const args={incidentId,edgeId,decision:"VERIFIED",expectedEdgeDigest:packet.expectedEdgeDigest,evidenceRefsJson:JSON.stringify(packet.evidenceRefs),reason:"Synthetic supported human graph review"};
    await assert.rejects(service.procedures.readGraphEdgeReview({incidentId,edgeId}),/FORBIDDEN/);
    await assert.rejects(o.procedures.readGraphEdgeReview({incidentId,edgeId}),/FORBIDDEN/);
    await assert.rejects(service.reducers.reviewGraphEdge({...meta(),...args}),/FORBIDDEN/);
    await assert.rejects(o.reducers.reviewGraphEdge({...meta(),...args}),/FORBIDDEN/);
    await assert.rejects(a.reducers.reviewGraphEdge({...meta(),...args}),/INVALID_INPUT/);
    await assert.rejects(a.reducers.reviewGraphEdge({...meta(),...args,expectedEdgeDigest:"a".repeat(64)}),/VERSION_CONFLICT/);
    await assert.rejects(a.reducers.reviewGraphEdge({...meta(),...args,evidenceRefsJson:JSON.stringify(packet.evidenceRefs.map((r:{version:number})=>({...r,version:r.version+1})))}),/VERSION_CONFLICT/);
    await assert.rejects(a.reducers.reviewGraphEdge({...meta(),...args,incidentId:otherId}),/FORBIDDEN|NOT_FOUND/);
    const runMeta=meta();const reviewRun=await result(b,()=>b.reducers.startInvestigation({...runMeta,incidentId,objective:"Synthetic graph review fixture"}),runMeta);
    await service.reducers.recordInvestigationEvent({...meta(),incidentId,runId:reviewRun,type:"run_started",provider:"SYNTHETIC_TEST",model:"review-test"});
    const findingMeta=meta();const findingId=await result(service,()=>service.reducers.recordFinding({...findingMeta,incidentId,runId:reviewRun,title:"Synthetic workstation evidence",summary:"Synthetic login evidence observed on workstation",evidenceIds:[evidenceId],assetIds:[assetId],confidence:"HIGH",unknowns:[]}),findingMeta);
    await assert.rejects(a.reducers.reviewGraphEdge({...meta(),...args,findingId}),/INVALID_TRANSITION/);
    await a.reducers.acceptFinding({...meta(),incidentId,findingId,reason:"Synthetic evidence-backed finding acceptance"});
    const unsupportedId=await link(b,assetId,evidenceId);
    const unsupported=JSON.parse(await a.procedures.readGraphEdgeReview({incidentId,edgeId:unsupportedId}));
    await assert.rejects(a.reducers.reviewGraphEdge({...meta(),...args,edgeId:unsupportedId,expectedEdgeDigest:unsupported.expectedEdgeDigest,evidenceRefsJson:JSON.stringify(unsupported.evidenceRefs),findingId}),/INVALID_INPUT/);
    const selfId=await link(a,evidenceId,assetId);const self=JSON.parse(await a.procedures.readGraphEdgeReview({incidentId,edgeId:selfId}));
    await assert.rejects(a.reducers.reviewGraphEdge({...meta(),...args,edgeId:selfId,expectedEdgeDigest:self.expectedEdgeDigest,evidenceRefsJson:JSON.stringify(self.evidenceRefs),findingId}),/FORBIDDEN/);
    for(const type of ["DEPENDS_ON","COMMUNICATES_WITH"]){await assert.rejects(b.reducers.linkGraphEdge({...meta(),incidentId,fromId:assetId,toId:`${incidentId}:app-host`,type,sourceEvidenceIds:[evidenceId],confidence:"HIGH"}),/INVALID_INPUT/);}
    await assert.rejects(a.procedures.readGraphEdgeReview({incidentId,edgeId:`${incidentId}:ws-app`}),/FORBIDDEN/);
    const reviewMeta=meta();const reviewArgs={...reviewMeta,...args,findingId};await a.reducers.reviewGraphEdge(reviewArgs);await a.reducers.reviewGraphEdge(reviewArgs);
    await eventually(()=>[...a.db.scopedGraphReviews.iter()].some(r=>r.edgeId===edgeId),"Immutable graph review missing");
    const reviewed=[...a.db.scopedEdges.iter()].find(e=>e.id===edgeId)!;assert.deepEqual(reviewed,{...before,verificationStatus:"VERIFIED"});
    const reviews=[...a.db.scopedGraphReviews.iter()].filter(r=>r.edgeId===edgeId);assert.equal(reviews.length,1);assert.equal(reviews[0].reviewedBy,getUser(a));assert.equal(reviews[0].findingId,findingId);assert.equal(reviews[0].expectedEdgeDigest,packet.expectedEdgeDigest);
    await assert.rejects(a.reducers.reviewGraphEdge({...meta(),...args,findingId}),/VERSION_CONFLICT|INVALID_TRANSITION/);
    const dispute=meta();await a.reducers.reviewGraphEdge({...dispute,...args,edgeId:unsupportedId,expectedEdgeDigest:unsupported.expectedEdgeDigest,evidenceRefsJson:JSON.stringify(unsupported.evidenceRefs),decision:"DISPUTED"});
    assert.equal([...a.db.scopedEdges.iter()].find(e=>e.id===unsupportedId)!.verificationStatus,"DISPUTED");
    const staleAuth=await connect("alice","breachbay-test",1000);await assert.rejects(staleAuth.connection.reducers.reviewGraphEdge({...meta(),...args,edgeId:selfId,expectedEdgeDigest:self.expectedEdgeDigest,evidenceRefsJson:JSON.stringify(self.evidenceRefs),decision:"DISPUTED"}),/UNAUTHENTICATED/);
    assert.equal(canonical([...a.db.scopedScenarios.iter()].find(s=>s.incidentId===incidentId)!.state),baselineScenario);
    await service.reducers.recordInvestigationEvent({...meta(),incidentId,runId:reviewRun,type:"run_failed",summary:"Synthetic test only; no model inference"});
    console.log("PASS scoped human graph review, accepted finding/provenance/version/typed endpoint gates, distinct reviewer, idempotent immutable review and unchanged simulator; routes/AI/observer/stale auth denied");
    for(const client of clients)client.disconnect();await new Promise<void>((resolve,reject)=>validation.close(error=>error?reject(error):resolve()));
    console.log("GRAPH REVIEW FOCUSED LIVE SMOKE PASSED (scheduler suite not run)");return;
  }
  const message = meta();
  await b.reducers.postMessage({
    ...message,
    incidentId,
    text: "Synthetic responder update",
  });
  await eventually(
    () =>
      [...a.db.scopedMessages.iter()].some(
        (m) => m.text === "Synthetic responder update",
      ),
    "Live update missing",
  );
  const before = [...a.db.scopedMessages.iter()].length;
  await b.reducers.postMessage({
    ...message,
    incidentId,
    text: "Synthetic responder update",
  });
  assert.equal([...a.db.scopedMessages.iter()].length, before);
  await assert.rejects(
    b.reducers.postMessage({ ...message, incidentId, text: "Changed retry" }),
    /IDEMPOTENCY_CONFLICT/,
  );
  await assert.rejects(
    b.reducers.postMessage({
      ...meta(),
      incidentId: otherId,
      text: "Foreign incident",
    }),
    /FORBIDDEN/,
  );
  await assert.rejects(
    o.reducers.postMessage({
      ...meta(),
      incidentId,
      text: "Observer mutation",
    }),
    /FORBIDDEN/,
  );
  console.log(
    "PASS real live collaboration, replay deduplication, rejected cross-incident mutations",
  );
  const privateQuery = await fetch(`${endpoint}/v1/database/${database}/sql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bob.jwt}`,
      "Content-Type": "text/plain",
    },
    body: "SELECT * FROM evidence",
  });
  assert.ok(!privateQuery.ok, "Private evidence table exposed");
  console.log("PASS direct private-table SQL read rejected for non-owner");
  await Promise.all(Array.from({length:24},(_,i)=>a.reducers.postMessage({...meta(),incidentId,text:`Synthetic rapid ID stress ${i}`})));
  await eventually(()=>[...a.db.scopedMessages.iter()].filter(m=>m.text.startsWith("Synthetic rapid ID stress")).length===24,"Rapid transactions lost message IDs");
  const auditIds=[...a.db.scopedAuditEvents.iter()].map(e=>e.id);
  assert.equal(new Set(auditIds).size,auditIds.length);
  console.log("PASS rapid transactional ID allocation is unique across message/audit writes");
  const runMeta = meta();
  const runId = await result(
    b,
    () =>
      b.reducers.startInvestigation({
        ...runMeta,
        incidentId,
        objective: "Synthetic permission test",
      }),
    runMeta,
  );
  await assert.rejects(
    b.reducers.recordInvestigationEvent({
      ...meta(),
      incidentId,
      runId,
      type: "run_started",
      provider: "Fabricated",
      model: "Fabricated",
    }),
    /FORBIDDEN/,
  );
  await service.reducers.recordInvestigationEvent({
    ...meta(),
    incidentId,
    runId,
    type: "run_started",
    provider: "SYNTHETIC_TEST",
    model: "boundary-test",
  });
  const traceMeta=meta();
  await service.reducers.recordToolRun({...traceMeta,incidentId,runId,tool:"get_incident_context",toolCallId:"synthetic-call-1",argumentsDigest:sha256("{}"),status:"COMPLETED",durationMs:3,providerLatencyMs:21,evidenceIds:[],citationsJson:"[]",resultJson:'{"synthetic":true}',summary:"Synthetic trace roundtrip"});
  await eventually(()=>[...a.db.scopedToolRuns.iter()].some(t=>t.investigationId===runId && t.toolCallId==="synthetic-call-1" && t.providerLatencyMs===21 && t.resultJson==='{"synthetic":true}'),"Durable trace lost fields");
  const citedEvidence=[...a.db.scopedEvidence.iter()].find(e=>e.incidentId===incidentId && e.modelApproved)!;
  await assert.rejects(service.reducers.recordToolRun({...meta(),incidentId,runId,tool:"search_evidence",argumentsDigest:sha256("{}"),status:"COMPLETED",evidenceIds:[citedEvidence.id],citationsJson:JSON.stringify([{evidenceId:citedEvidence.id,version:citedEvidence.version+1,sha256:citedEvidence.redactedSha256}])}),/VERSION_CONFLICT/);
  await service.reducers.recordInvestigationEvent({...meta(),incidentId,runId,type:"tool_completed",tool:"get_incident_context",dataJson:JSON.stringify({toolCallId:"synthetic-call-1",argumentsDigest:sha256("{}"),step:0,result:{synthetic:true}})});
  await eventually(()=>[...a.db.scopedStreamEvents.iter()].some(e=>e.runId===runId && e.dataJson?.includes("synthetic-call-1")),"Stream lost safe dataJson");
  const cancelledMeta=meta();
  const cancelledId=await result(b,()=>b.reducers.startInvestigation({...cancelledMeta,incidentId,objective:"Synthetic durable cancellation test"}),cancelledMeta);
  await assert.rejects(service.reducers.cancelInvestigation({...meta(),incidentId,runId:cancelledId,reason:"Forbidden service"}),/FORBIDDEN/);
  await assert.rejects(o.reducers.cancelInvestigation({...meta(),incidentId,runId:cancelledId,reason:"Forbidden observer"}),/FORBIDDEN/);
  const cancel=meta();await b.reducers.cancelInvestigation({...cancel,incidentId,runId:cancelledId,reason:"Synthetic requester cancellation"});await b.reducers.cancelInvestigation({...cancel,incidentId,runId:cancelledId,reason:"Synthetic requester cancellation"});
  const runningCancelMeta=meta();const runningCancelId=await result(b,()=>b.reducers.startInvestigation({...runningCancelMeta,incidentId,objective:"Synthetic commander stop"}),runningCancelMeta);
  await service.reducers.recordInvestigationEvent({...meta(),incidentId,runId:runningCancelId,type:"run_started",provider:"SYNTHETIC_TEST",model:"cancel-test"});
  await service.reducers.recordToolRun({...meta(),incidentId,runId:runningCancelId,tool:"search_evidence",argumentsDigest:sha256("{}"),status:"RUNNING",evidenceIds:[]});
  await a.reducers.cancelInvestigation({...meta(),incidentId,runId:runningCancelId,reason:"Synthetic commander cancellation"});
  await eventually(()=>[...a.db.scopedInvestigations.iter()].find(r=>r.id===runningCancelId)?.status==="CANCELLED","Cancellation not durable");
  await assert.rejects(service.reducers.recordInvestigationEvent({...meta(),incidentId,runId:runningCancelId,type:"run_completed"}),/INVALID_TRANSITION/);
  await assert.rejects(service.reducers.recordToolRun({...meta(),incidentId,runId:runningCancelId,tool:"search_evidence",argumentsDigest:sha256("{}"),status:"COMPLETED",evidenceIds:[]}),/FORBIDDEN/);
  await assert.rejects(service.reducers.recordFinding({...meta(),incidentId,runId:runningCancelId,title:"late",summary:"late",confidence:"LOW",evidenceIds:[citedEvidence.id],assetIds:[],unknowns:[]}),/FORBIDDEN/);
  const orphanMeta=meta(), runningMeta=meta();
  const orphanId=await result(a,()=>a.reducers.startInvestigation({...orphanMeta,incidentId,objective:"Synthetic abandoned queued job"}),orphanMeta);
  const runningId=await result(a,()=>a.reducers.startInvestigation({...runningMeta,incidentId,objective:"Synthetic abandoned running job"}),runningMeta);
  await service.reducers.recordInvestigationEvent({...meta(),incidentId,runId:runningId,type:"run_started",provider:"SYNTHETIC_TEST",model:"deadline-test"});
  await service.reducers.recordToolRun({...meta(),incidentId,runId:runningId,tool:"search_evidence",argumentsDigest:sha256("{}"),status:"RUNNING",evidenceIds:[]});
  await service.reducers.recordInvestigationEvent({
    ...meta(),
    incidentId,
    runId,
    type: "run_failed",
    summary: "Synthetic permission fixture; no model call made",
  });
  console.log(
    "PASS human cannot forge AI trace records; scoped service writes enforced",
  );
  let inc = [...a.db.scopedIncidents.iter()].find((i) => i.id === incidentId)!;
  await a.reducers.transitionIncident({
    ...meta(),
    incidentId,
    status: "TRIAGED",
    reason: "Synthetic triage",
    expectedVersion: inc.version,
  });
  inc = [...a.db.scopedIncidents.iter()].find((i) => i.id === incidentId)!;
  await a.reducers.transitionIncident({
    ...meta(),
    incidentId,
    status: "INVESTIGATING",
    reason: "Synthetic investigation",
    expectedVersion: inc.version,
  });
  await assert.rejects(service.reducers.proposeAction({...meta(),incidentId,investigationId:runningCancelId,action:{type:"ISOLATE_SIMULATED_HOST",targetIds:[`${incidentId}:app-host`]},rationale:"late cancelled proposal",evidenceIds:[citedEvidence.id],assumptions:[],uncertainty:[],expectedVersion:1}),/INVALID_TRANSITION/);
  const evidenceId = [...b.db.scopedEvidence.iter()][0].id;
  const target = `${incidentId}:app-host`;
  const planning={assumptions:[],uncertainty:["Alternate path remains"],alternatives:[{action:{type:"BLOCK_SIMULATED_ROUTE",targetIds:[`${incidentId}:jump-db`]},rationale:"Synthetic route alternative",tradeoffs:["Residual paths remain"],expectedImpact:{containmentCoverage:999}}]};
  await assert.rejects(b.reducers.proposeAction({...meta(),incidentId,action:{type:"ISOLATE_SIMULATED_HOST",targetIds:[target]},rationale:"Invalid plan",evidenceIds:[evidenceId],assumptions:[],uncertainty:[],planningJson:JSON.stringify(planning),expectedVersion:1}),/INVALID_MODEL_OUTPUT/);
  const proposalMeta = meta();
  const proposalId = await result(
    b,
    () =>
      b.reducers.proposeAction({
        ...proposalMeta,
        incidentId,
        action: { type: "ISOLATE_SIMULATED_HOST", targetIds: [target] },
        rationale: "Synthetic evidence-backed containment",
        evidenceIds: [evidenceId],
        assumptions: [],
        uncertainty: ["Alternate path remains"],
        planningJson:JSON.stringify(planning),
        expectedVersion: 1,
      }),
    proposalMeta,
  );
  const persistedPlan=JSON.parse([...a.db.scopedProposals.iter()].find(p=>p.id===proposalId)!.planningJson!);
  assert(persistedPlan.alternatives[0].expectedImpact.containmentCoverage<=1,"Untrusted expectedImpact persisted");
  const findingMeta=meta();
  await service.reducers.recordFinding({...findingMeta,incidentId,runId:runningId,title:"Synthetic follow-up",summary:"Supported synthetic finding",confidence:"HIGH",evidenceIds:[evidenceId],assetIds:[],unknowns:[],recommendedNextQueries:["Review alternate route"]});
  await eventually(()=>[...a.db.scopedFindings.iter()].some(f=>f.investigationId===runningId && f.recommendedNextQueries?.[0]==="Review alternate route"),"Finding next-query projection lost fields");
  await assert.rejects(service.reducers.recordFinding({...meta(),incidentId,runId:runningId,title:"Invalid follow-up",summary:"Supported synthetic finding",confidence:"HIGH",evidenceIds:[evidenceId],assetIds:[],unknowns:[],recommendedNextQueries:["x".repeat(201)]}),/INVALID_MODEL_OUTPUT/);
  const completedPlanMeta=meta();const completedPlanRun=await result(b,()=>b.reducers.startInvestigation({...completedPlanMeta,incidentId,objective:"Synthetic plan recovery"}),completedPlanMeta);
  await service.reducers.recordInvestigationEvent({...meta(),incidentId,runId:completedPlanRun,type:"run_started",provider:"SYNTHETIC_TEST",model:"planning-test"});
  await service.reducers.recordInvestigationEvent({...meta(),incidentId,runId:completedPlanRun,type:"run_completed",dataJson:JSON.stringify({planning})});
  await eventually(()=>[...a.db.scopedInvestigations.iter()].some(r=>r.id===completedPlanRun && r.status==="COMPLETED" && r.planningJson!==undefined),"Completed plan not persisted");
  assert(JSON.parse([...a.db.scopedInvestigations.iter()].find(r=>r.id===completedPlanRun)!.planningJson!).alternatives[0].expectedImpact.containmentCoverage<=1);
  await eventually(()=>[...a.db.scopedStreamEvents.iter()].some(e=>e.runId===completedPlanRun && e.type==="run_completed"),"Completed planning stream missing");
  const completedData=JSON.parse([...a.db.scopedStreamEvents.iter()].find(e=>e.runId===completedPlanRun && e.type==="run_completed")!.dataJson!);assert(completedData.planning.alternatives[0].expectedImpact.containmentCoverage<=1);
  console.log("PASS persisted bounded next queries, planning mismatch rejection and authoritative alternative impact");
  await a.reducers.simulateAction({
    ...meta(),
    incidentId,
    proposalId,
    expectedVersion: 1,
  });
  let proposal = [...a.db.scopedProposals.iter()].find(
    (p) => p.id === proposalId,
  )!;
  await assert.rejects(
    o.reducers.approveAction({
      ...meta(),
      incidentId,
      proposalId,
      decision: "APPROVE",
      justification: "Unauthorized observer",
      expectedVersion: 1,
      proposalVersion: proposal.version,
    }),
    /FORBIDDEN/,
  );
  await assert.rejects(
    service.reducers.approveAction({
      ...meta(),
      incidentId,
      proposalId,
      decision: "APPROVE",
      justification: "Unauthorized AI",
      expectedVersion: 1,
      proposalVersion: proposal.version,
    }),
    /FORBIDDEN/,
  );
  await a.reducers.approveAction({
    ...meta(),
    incidentId,
    proposalId,
    decision: "APPROVE",
    justification: "Synthetic approved preview",
    expectedVersion: 1,
    proposalVersion: proposal.version,
  });
  const execute = meta();
  await a.reducers.executeSimulation({
    ...execute,
    incidentId,
    proposalId,
    expectedVersion: 1,
  });
  await a.reducers.executeSimulation({
    ...execute,
    incidentId,
    proposalId,
    expectedVersion: 1,
  });
  assert.equal(
    [...a.db.scopedVerifications.iter()].filter(
      (v) => v.proposalId === proposalId,
    ).length,
    1,
  );
  assert.equal(
    [...a.db.scopedVerifications.iter()].find(
      (v) => v.proposalId === proposalId,
    )!.status,
    "VERIFIED_SUCCESS",
  );
  assert.equal(
    [...a.db.scopedAssets.iter()].find((asset) => asset.id === target)!.state,
    "ISOLATED",
  );
  assert.equal(
    [...a.db.scopedAssets.iter()].find(
      (asset) => asset.id === `${incidentId}:customer-portal`,
    )!.state,
    "DEGRADED",
  );
  await assert.rejects(
    a.reducers.executeSimulation({
      ...meta(),
      incidentId,
      proposalId,
      expectedVersion: 1,
    }),
    /INVALID_TRANSITION/,
  );
  console.log(
    "PASS deterministic simulation, human approval, one execution, verification and service impact",
  );
  const stale = meta();
  const staleId = await result(
    b,
    () =>
      b.reducers.proposeAction({
        ...stale,
        incidentId,
        action: {
          type: "BLOCK_SIMULATED_ROUTE",
          targetIds: [`${incidentId}:jump-db`],
        },
        rationale: "Stale version test",
        evidenceIds: [evidenceId],
        assumptions: [],
        uncertainty: [],
        expectedVersion: 2,
      }),
    stale,
  );
  await a.reducers.simulateAction({
    ...meta(),
    incidentId,
    proposalId: staleId,
    expectedVersion: 2,
  });
  const staleVersion = [...a.db.scopedProposals.iter()].find(
    (p) => p.id === staleId,
  )!.version;
  const advanceMeta = meta();
  const advanceId = await result(
    b,
    () =>
      b.reducers.proposeAction({
        ...advanceMeta,
        incidentId,
        action: {
          type: "BLOCK_SIMULATED_ROUTE",
          targetIds: [`${incidentId}:ws-jump`],
        },
        rationale: "Advance scenario for concurrency test",
        evidenceIds: [evidenceId],
        assumptions: [],
        uncertainty: [],
        expectedVersion: 2,
      }),
    advanceMeta,
  );
  await a.reducers.simulateAction({
    ...meta(),
    incidentId,
    proposalId: advanceId,
    expectedVersion: 2,
  });
  await a.reducers.approveAction({
    ...meta(),
    incidentId,
    proposalId: advanceId,
    decision: "APPROVE",
    justification: "Advance scenario",
    expectedVersion: 2,
    proposalVersion: [...a.db.scopedProposals.iter()].find(
      (p) => p.id === advanceId,
    )!.version,
  });
  await a.reducers.executeSimulation({
    ...meta(),
    incidentId,
    proposalId: advanceId,
    expectedVersion: 2,
  });
  await assert.rejects(
    a.reducers.approveAction({
      ...meta(),
      incidentId,
      proposalId: staleId,
      decision: "APPROVE",
      justification: "Stale scenario version",
      expectedVersion: 2,
      proposalVersion: staleVersion,
    }),
    /VERSION_CONFLICT/,
  );
  const initialSnapshot=[...a.db.scopedScenarioHistory.iter()].find(row=>row.incidentId===incidentId && row.scenarioVersion===1)!;
  assert(initialSnapshot);assert(!("stateJson" in initialSnapshot));
  const saved=JSON.parse(await a.procedures.readScenarioSnapshot({incidentId,snapshotId:initialSnapshot.id}));
  assert.equal(saved.version,1);
  await assert.rejects(service.procedures.readScenarioSnapshot({incidentId,snapshotId:initialSnapshot.id}),/FORBIDDEN/);
  const restoreArgs={incidentId,snapshotId:initialSnapshot.id,reason:"Synthetic human restoration",expectedVersion:3};
  await assert.rejects(service.reducers.restoreScenario({...meta(),...restoreArgs}),/FORBIDDEN/);
  await assert.rejects(o.reducers.restoreScenario({...meta(),...restoreArgs}),/FORBIDDEN/);
  await assert.rejects(a.reducers.restoreScenario({...meta(),...restoreArgs,expectedVersion:2}),/VERSION_CONFLICT/);
  const preserved={evidence:[...a.db.scopedEvidence.iter()].length,approvals:[...a.db.scopedApprovals.iter()].length,verifications:[...a.db.scopedVerifications.iter()].length};
  const restoreKey=meta();await a.reducers.restoreScenario({...restoreKey,...restoreArgs});await a.reducers.restoreScenario({...restoreKey,...restoreArgs});
  assert.equal([...a.db.scopedScenarios.iter()].find(row=>row.incidentId===incidentId)!.state.version,4);
  assert.equal([...a.db.scopedAssets.iter()].find(row=>row.id===target)!.state,"ACTIVE");
  assert.equal([...a.db.scopedAssets.iter()].find(row=>row.id===`${incidentId}:customer-portal`)!.state,"ACTIVE");
  assert.deepEqual({evidence:[...a.db.scopedEvidence.iter()].length,approvals:[...a.db.scopedApprovals.iter()].length,verifications:[...a.db.scopedVerifications.iter()].length},preserved);
  const restored=[...a.db.scopedScenarioHistory.iter()].filter(row=>row.incidentId===incidentId && row.operation==="RESTORE");assert.equal(restored.length,1);assert.equal(restored[0].restoredFromId,initialSnapshot.id);assert.equal(restored[0].parentVersion,3);
  await assert.rejects(a.procedures.readScenarioSnapshot({incidentId:"foreign",snapshotId:initialSnapshot.id}),/FORBIDDEN|NOT_FOUND/);
  console.log("PASS human monotonic restoration, immutable private replay, role/version denials and preserved history");
  await a.reducers.setMember({
    ...meta(),
    incidentId,
    userId: getUser(b),
    role: "COMMANDER",
    active: true,
  });
  await assert.rejects(
    b.reducers.approveAction({
      ...meta(),
      incidentId,
      proposalId: staleId,
      decision: "APPROVE",
      justification: "Self approval",
      expectedVersion: 2,
      proposalVersion: staleVersion,
    }),
    /FORBIDDEN/,
  );
  await a.reducers.setMember({
    ...meta(),
    incidentId,
    userId: getUser(b),
    role: "INVESTIGATOR",
    active: false,
  });
  await eventually(
    () => [...b.db.scopedEvidence.iter()].length === 0,
    "Revocation did not retract subscription rows",
  );
  await assert.rejects(
    b.reducers.postMessage({ ...meta(), incidentId, text: "After revoke" }),
    /FORBIDDEN/,
  );
  console.log(
    "PASS stale approval, self approval, membership revocation retracts live evidence",
  );
  const expiredAuth = await connect("alice", "breachbay-test", 1000);
  await assert.rejects(
    expiredAuth.connection.reducers.createIncident({
      ...meta(),
      title: "Stale auth",
      description: "Synthetic",
      severity: "LOW",
      classification: "SYNTHETIC",
      scenarioId: "credential-compromise",
    }),
    /UNAUTHENTICATED/,
  );
  await assert.rejects(connect("wrong-audience", "wrong-audience"));
  const short = await connect("short-session", "breachbay-test", 0, 3);
  await a.reducers.setMember({
    ...meta(),
    incidentId,
    userId: getUser(short.connection),
    role: "OBSERVER",
    active: true,
  });
  await eventually(
    () => [...short.connection.db.scopedEvidence.iter()].length > 0,
    "Short session never subscribed",
  );
  await delay(3300);
  await eventually(
    () => [...short.connection.db.scopedEvidence.iter()].length === 0,
    "Expired session retains evidence",
  );
  await assert.rejects(
    short.connection.reducers.postMessage({
      ...meta(),
      incidentId,
      text: "Expired session",
    }),
  );
  console.log("PASS token expiry retracts live private views");
  await o.reducers.logout(meta());
  await eventually(
    () => [...o.db.scopedEvidence.iter()].length === 0,
    "Logout did not retract rows",
  );
  await assert.rejects(
    o.reducers.postMessage({ ...meta(), incidentId, text: "Revoked session" }),
    /UNAUTHENTICATED/,
  );
  const renewed = await connect("observer");
  await eventually(
    () => [...renewed.connection.db.scopedEvidence.iter()].length > 0,
    "New session not granted",
  );
  assert.equal(
    [...o.db.scopedEvidence.iter()].length,
    0,
    "Old lease regained access after new login",
  );
  await assert.rejects(
    o.procedures.openReadSession({
      lease:
        randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", ""),
      token: observer.jwt,
    }),
  );
  console.log(
    "PASS logout revokes old token and old leases remain denied after new login",
  );
  const disabledBootstrap=await connect("disabled-bootstrap");
  await a.reducers.setUserStatus({...meta(),userId:[...disabledBootstrap.connection.db.myProfile.iter()][0].id,status:"DISABLED",reason:"Synthetic bootstrap disabled-state test"});
  const revokedBootstrap=await connect("revoked-bootstrap");
  await revokedBootstrap.connection.reducers.logout(meta());
  const bootstrapEnv=(commanders:string,services="ai")=>execFileSync("spacetime",["publish","--env-only","--server",endpoint,"--no-config",database],{env:{...process.env,BOOTSTRAP_COMMANDER_SUBJECTS:commanders,SERVICE_SUBJECTS:services},stdio:"pipe"});
  const commanderList="alice,dave,outsider,disabled-bootstrap,revoked-bootstrap";
  bootstrapEnv(commanderList);
  const promoted=await connect("outsider");
  assert.equal([...promoted.connection.db.myProfile.iter()][0].platformAdmin,true,"Previously ordinary principal was not explicitly promoted");
  assert.equal([...promoted.connection.db.scopedEvidence.iter()].filter(e=>e.incidentId===incidentId).length,0,"Bootstrap granted foreign evidence access");
  const promotedMeta=meta();
  const promotedIncident=await result(promoted.connection,()=>promoted.connection.reducers.createIncident({...promotedMeta,title:"Explicit bootstrap test",description:"Synthetic existing principal bootstrap",severity:"LOW",classification:"SYNTHETIC",scenarioId:"credential-compromise"}),promotedMeta);
  assert(promotedIncident);
  await assert.rejects(connect("disabled-bootstrap"));
  await assert.rejects(revokedBootstrap.connection.procedures.openReadSession({lease:randomUUID().replaceAll("-","")+randomUUID().replaceAll("-",""),token:revokedBootstrap.jwt}));
  bootstrapEnv(commanderList+",ai");
  await assert.rejects(connect("ai")); // service cannot become commander via overlap
  bootstrapEnv("alice,dave","ai,outsider");
  await assert.rejects(connect("outsider")); // existing human cannot be silently reclassified as service
  bootstrapEnv(commanderList);
  console.log("PASS explicit existing-human bootstrap, no evidence grant, disabled/revoked preservation and service/human migration rejection");
  console.log("Waiting for actual 120-second server investigation deadline (no model calls)");
  const deadline=Date.now()+130000;
  while(Date.now()<deadline && ![orphanId,runningId].every(id=>[...a.db.scopedInvestigations.iter()].some(r=>r.id===id && r.status==="FAILED"))) await delay(500);
  for(const id of [orphanId,runningId]) {
    assert.equal([...a.db.scopedInvestigations.iter()].find(r=>r.id===id)?.status,"FAILED");
    assert.equal([...a.db.scopedStreamEvents.iter()].filter(e=>e.runId===id && e.summary==="RUN_DEADLINE_EXCEEDED").length,1);
  }
  assert([...a.db.scopedToolRuns.iter()].some(t=>t.investigationId===runningId && t.status==="FAILED" && t.failureCode==="RUN_DEADLINE_EXCEEDED"));
  await assert.rejects(service.reducers.recordInvestigationEvent({...meta(),incidentId,runId:runningId,type:"run_completed"}),/INVALID_TRANSITION/);
  console.log("PASS durable trace roundtrip and real scheduler reconciles queued/running orphan jobs once; late completion denied");
  for(const id of [cancelledId,runningCancelId])assert.equal([...a.db.scopedInvestigations.iter()].find(r=>r.id===id)?.status,"CANCELLED","Scheduler overwrote cancellation");
  assert.equal([...a.db.scopedStreamEvents.iter()].filter(e=>e.runId===cancelledId && e.type==="run_cancelled").length,1);
  console.log("PASS requester/commander durable cancellation, service/observer denial, late model writes rejected and deadline preserves CANCELLED");
  const events = [...a.db.scopedAuditEvents.iter()].filter(
    (e) => e.incidentId === incidentId,
  );
  const byHash = new Map(events.map((e) => [e.hash, e]));
  for (const event of events) {
    const { hash, ...body } = event;
    assert.equal(hash, sha256(canonical(body)));
    assert.ok(!event.previousHash || byHash.has(event.previousHash));
  }
  console.log(
    "PASS recent authentication, issuer/audience boundary and audit digest chain",
  );
  for (const conn of clients) conn.disconnect();
  await new Promise<void>((resolve, reject) =>
    validation.close((error) => (error ? reject(error) : resolve())),
  );
  console.log("REAL BACKEND SECURITY SMOKE PASSED");
}
main().catch(async (error) => {
  if (process.env.BREACHBAY_LAB_REPORT_DIR) {
    await mkdir(process.env.BREACHBAY_LAB_REPORT_DIR, { recursive: true, mode: 0o700 });
    await writeFile(`${process.env.BREACHBAY_LAB_REPORT_DIR}/failure.json`, JSON.stringify(error, Object.getOwnPropertyNames(error ?? {}), 2), { mode: 0o600 });
  }
  console.error(
    error instanceof Error ? error.message : "Backend integration failed",
  );
  process.exit(1);
});
