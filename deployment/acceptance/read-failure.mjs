// Read fixed diagnostics from one actual scoped terminal run; never prints trace payloads.
import assert from 'node:assert/strict';
import {createClerkClient} from '@clerk/backend';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
async function main() {
  const load = async path => { const imported = await import(pathToFileURL(join(process.cwd(), path)).href); return imported.default ?? imported; };
  const {connectBackend, snapshotFromConnection} = await load('src/lib/backend/client.ts');
  const {assertServiceSession} = await load('src/lib/backend/service-session-operator.ts');
  const client = createClerkClient({secretKey: process.env.CLERK_SECRET_KEY});
  assertServiceSession(await client.sessions.getSession(process.env.AI_SERVICE_CLERK_SESSION_ID), process.env.AI_SERVICE_CLERK_USER_ID);
  const token = await client.sessions.getToken(process.env.AI_SERVICE_CLERK_SESSION_ID, process.env.CLERK_JWT_TEMPLATE, 120);
  const conn = await connectBackend({endpoint: process.env.SPACETIMEDB_ENDPOINT ?? process.env.NEXT_PUBLIC_SPACETIMEDB_ENDPOINT, database: process.env.SPACETIMEDB_DATABASE ?? process.env.NEXT_PUBLIC_SPACETIMEDB_DATABASE, token: token.jwt});
  try {
    const state = snapshotFromConnection(conn, process.env.BREACHBAY_TRACE_INCIDENT_ID);
    assert.equal(state?.incident.classification, 'SYNTHETIC');
    const terminal = state.streamEvents?.find(e => e.correlationId === process.env.BREACHBAY_TRACE_CORRELATION_ID && e.type === 'run_failed');
    assert.ok(terminal);
    const data = JSON.parse(terminal.dataJson);
    const stages = new Set(['PROVIDER','TOOLS','FINAL_JSON','FINDINGS','PLANNING','PROPOSAL','PERSISTENCE','BUDGET']);
    const reasons = new Set(['PROVIDER_TRUNCATED','PROVIDER_JSON_INVALID','PROVIDER_SCHEMA_INVALID','PROVIDER_TOO_LARGE','PROVIDER_FINAL_TOOL_CALLS','FINAL_JSON_INVALID','FINAL_ROOT_INVALID','FINDINGS_SHAPE_INVALID','FINDING_FIELDS_INVALID','CITATION_NOT_RETRIEVED','NEXT_QUERIES_INVALID','NEXT_QUERIES_MISSING','NO_FINDINGS','PLAN_FIELDS_INVALID','PLAN_ALTERNATIVE_INVALID','PLAN_REQUIRED','PLAN_DISTINCT_ALTERNATIVE_REQUIRED','VALIDATION_REJECTED']);
    console.log(JSON.stringify({actualPersistedFailure: true, stage: stages.has(data.failureStage) ? data.failureStage : 'UNKNOWN', reason: reasons.has(data.failureReason) ? data.failureReason : 'UNCLASSIFIED', step: Number.isInteger(data.step) && data.step >= 0 && data.step < 8 ? data.step : undefined, correctionCount: Array.isArray(data.validationCorrections) ? Math.min(data.validationCorrections.length, 2) : 0}));
  } finally { conn.disconnect(); }
}
main().catch(() => { console.error('FAIL: scoped diagnostic read; no credentials or trace payload output'); process.exitCode = 1; });
