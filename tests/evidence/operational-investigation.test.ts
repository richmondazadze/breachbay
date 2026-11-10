/** Scripted responses test boundaries; actual NVIDIA proof is captured separately by the lab runner. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { parseLog } from "../../src/lib/evidence/parse-log";
import { logDerivative, observedAssetId } from "../../src/lib/evidence/import-manifest";
import { executeOperationalTool, investigateOperational, type OperationalContext } from "../../src/lib/ai/operational-investigation";
import type { InvestigationEvent, InvestigationPorts } from "../../src/lib/ai/investigation";
import { approvedLogExcerpt } from "../../src/lib/backend/model-log-context";
import { AuthError } from "../../src/lib/backend/clerk-token";
import type { Evidence } from "../../src/lib/contracts";
const observations = parseLog(Buffer.from(JSON.stringify({ schema: "breachbay.event.v1", timestamp: "2026-11-08T12:00:00Z", eventType: "auth.login", host: "private-host", outcome: "failure" })), "breachbay-jsonl");
const derivative = logDerivative("a", observations);
const evidence: Evidence = { id: "e", incidentId: "a", version: 2, kind: "LOG", title: "test", source: "private source", createdAt: observations[0].timestamp, capturedAt: observations[0].timestamp, sha256: "0".repeat(64), redactedSha256: createHash("sha256").update(derivative).digest("hex"), classification: "INTERNAL", modelApproved: true, redactedContent: derivative, assetIds: [observedAssetId("a", "private-host")] };
const context: OperationalContext = { incidentId: "a", classification: "INTERNAL", evidence: [approvedLogExcerpt(evidence)], graph: { version: 2, assets: [], edges: [] } };
test("model excerpt binds exact approved bytes, rejects altered hash/raw hosts/unapproved records", () => {
  const excerpt = approvedLogExcerpt(evidence);
  assert.equal(excerpt.excerpt, derivative); assert.equal(excerpt.sha256, evidence.redactedSha256);
  assert(!JSON.stringify(excerpt).includes("private-host")); assert(!JSON.stringify(excerpt).includes("private source"));
  assert.throws(() => approvedLogExcerpt({ ...evidence, modelApproved: false }));
  assert.throws(() => approvedLogExcerpt({ ...evidence, redactedSha256: "0".repeat(64) }));
  const raw = JSON.stringify({ schema: "breachbay.observations.v1", events: observations });
  assert.throws(() => approvedLogExcerpt({ ...evidence, redactedContent: raw, redactedSha256: createHash("sha256").update(raw).digest("hex") }));
});
test("operational tools aggregate observed outcomes and reject execution/unexpected arguments", () => {
  assert.deepEqual(executeOperationalTool("summarize_observations", {}, context), { counts: { "auth.login:failure": 1 }, evidenceIds: ["e"], limitation: "Counts may overlap across source files; original-file deduplication does not establish cross-source event deduplication." });
  assert.throws(() => executeOperationalTool("simulate_response", {}, context));
  assert.throws(() => executeOperationalTool("get_asset_graph", { incidentId: "foreign" }, context));
});
test("three read tools then native final schema produce cited hypotheses, correct classification and no action", async () => {
  const previous = { key: process.env.NEMOTRON_API_KEY, base: process.env.NEMOTRON_BASE_URL, model: process.env.NEMOTRON_MODEL }, fetch = globalThis.fetch;
  process.env.NEMOTRON_API_KEY = "test-only"; process.env.NEMOTRON_BASE_URL = "https://example.invalid/v1"; process.env.NEMOTRON_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";
  const events: InvestigationEvent[] = []; let calls = 0, writes = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const request = JSON.parse(String(init?.body)); assert(!JSON.stringify(request).includes("private-host"));
    if (calls === 1) return Response.json({ choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: ["search_evidence", "get_asset_graph", "summarize_observations"].map((name, i) => ({ id: `call-${i}`, type: "function", function: { name, arguments: name === "search_evidence" ? '{"query":""}' : "{}" } })) } }] });
    assert(request.response_format?.json_schema); assert.equal(request.tools, undefined);
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ findings: [{ summary: "One failed login was observed.", confidence: "LOW", evidenceIds: ["e"], unknowns: ["The logs do not establish compromise."], recommendedNextQueries: ["Review subsequent login activity"] }], planning: { assumptions: [], uncertainty: ["Current host health is unknown"], alternatives: [] }, proposal: null }) } }] });
  };
  const ports: InvestigationPorts = { loadContext: async () => { throw new Error("No synthetic context"); }, loadOperationalContext: async () => context, persistEvent: async e => { events.push(e); }, submitProposal: async () => { writes++; throw new Error("No actions allowed"); } };
  try {
    const result = await investigateOperational("a", "Review approved logs", ports);
    assert.equal(result.findings.length, 1); assert.equal(calls, 2); assert.equal(writes, 0);
    assert.equal(events.at(-1)?.type, "run_completed");
    assert(events.filter(e => e.type.startsWith("provider_call")).every(e => e.data.classification === "INTERNAL"));
    const denial = new AuthError("FORBIDDEN", "Revoked");
    await assert.rejects(investigateOperational("a", "Review", { ...ports, loadOperationalContext: async () => { throw denial; } }), e => e === denial);
  } finally {
    globalThis.fetch = fetch;
    for (const [k, v] of Object.entries({ NEMOTRON_API_KEY: previous.key, NEMOTRON_BASE_URL: previous.base, NEMOTRON_MODEL: previous.model })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

test("revocation during provider reasoning blocks further tools and final findings; invalid citations never complete", async () => {
  const previous = { NEMOTRON_API_KEY: process.env.NEMOTRON_API_KEY, NEMOTRON_BASE_URL: process.env.NEMOTRON_BASE_URL, NEMOTRON_MODEL: process.env.NEMOTRON_MODEL };
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, { NEMOTRON_API_KEY: "test-only", NEMOTRON_BASE_URL: "https://example.invalid/v1", NEMOTRON_MODEL: "nvidia/nemotron-3.5-lightning-30b-a3b" });
  try {
    for (const mode of ["revoke-during-tools", "revoke-during-final", "invalid-citation", "proposed-action"] as const) {
      let calls = 0, revoked = false;
      const events: InvestigationEvent[] = [];
      globalThis.fetch = async () => {
        calls++;
        if (calls === 1) {
          if (mode === "revoke-during-tools") revoked = true;
          return Response.json({ choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: ["search_evidence", "get_asset_graph", "summarize_observations"].map((name, i) => ({ id: `call-${i}`, type: "function", function: { name, arguments: name === "search_evidence" ? '{"query":""}' : "{}" } })) } }] });
        }
        if (mode === "revoke-during-final") revoked = true;
        return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ findings: [{ summary: "A failed login was observed.", confidence: "LOW", evidenceIds: [mode === "invalid-citation" ? "foreign-evidence" : "e"], unknowns: ["Cause unknown"], recommendedNextQueries: ["Review identity activity"] }], planning: { assumptions: [], uncertainty: ["Current health unknown"], alternatives: [] }, proposal: mode === "proposed-action" ? { type: "DISABLE_APPLICATION_LOGIN" } : null }) } }] });
      };
      const ports: InvestigationPorts = {
        loadContext: async () => { throw new Error("No synthetic context"); },
        loadOperationalContext: async () => revoked ? { ...context, evidence: [] } : context,
        persistEvent: async e => { events.push(e); }, submitProposal: async () => { throw new Error("No execution allowed"); },
      };
      await assert.rejects(investigateOperational("a", "Review approved logs", ports));
      assert(!events.some(e => e.type === "finding" || e.type === "run_completed"), mode);
      if (mode === "revoke-during-tools") { assert.equal(calls, 1); assert(!events.some(e => e.type === "tool_completed")); }
      else assert.equal(calls, 2);
      if (mode === "invalid-citation" || mode === "proposed-action") assert.equal(events.at(-1)?.type, "run_failed");
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
