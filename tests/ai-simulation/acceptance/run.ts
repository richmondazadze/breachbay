/** Real deployed acceptance only. Never install a mock fetch/provider or print credentials. */
import assert from 'node:assert/strict';
import { originalTokenWindow, AcceptanceLifetimeError } from './lifetime';
import { randomUUID } from 'node:crypto';
import { connectBackend, snapshotFromConnection } from '../../../src/lib/backend/client';
import { alternatePathEvidence } from '../../../src/lib/simulation/reassessment';
import { verifyRealRun, verifyOutage, type DurableEvent } from './validate';
function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`Missing required environment variable: ${name}`); return value; }
function secureOrigin(value: string) { const url = new URL(value); assert(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash, 'Acceptance requires HTTPS endpoint without credentials'); return url.origin; }
async function main() {
  const origin = secureOrigin(required('BREACHBAY_ACCEPTANCE_ORIGIN'));
  const token = required('BREACHBAY_ACCEPTANCE_TOKEN'); // original browser session JWT, never BAPI replacement
  const window = originalTokenWindow(token, origin);
  const incidentId = required('BREACHBAY_ACCEPTANCE_INCIDENT_ID');
  const model = required('BREACHBAY_ACCEPTANCE_MODEL');
  assert(/nemotron/i.test(model), 'Acceptance model must explicitly identify Nemotron');
  const mode = process.env.BREACHBAY_ACCEPTANCE_MODE ?? 'investigate';
  assert(['investigate','reassess','outage'].includes(mode), 'Invalid acceptance mode');
  const conn = await connectBackend({ endpoint: required('BREACHBAY_ACCEPTANCE_SPACETIME_ENDPOINT'), database: required('BREACHBAY_ACCEPTANCE_DATABASE'), token });
  const snapshot = () => { window.remaining(); const state = snapshotFromConnection(conn, incidentId); assert(state, 'Assigned synthetic incident unavailable'); return state; };
  const request = async (path: string, init: RequestInit, capMs = 90000) => {
    const signal = window.signal(capMs);
    try {
      const response = await fetch(`${origin}${path}`, { ...init, signal, redirect: 'error' });
      // Keep body consumption within the same lifetime-bound request signal.
      const result = await response.json();
      window.remaining();
      return { response, result };
    } catch (error) {
      window.remaining(); // converts a deadline abort into an explicit original-lifetime failure
      throw error;
    }
  };
  const post = (path: string, body: BodyInit, contentType?: string) => request(path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: origin, ...(contentType ? { 'Content-Type': contentType } : {}) }, body });
  try {
    const before = snapshot(); assert.equal(before.incident.classification, 'SYNTHETIC');
    let injectedEvidenceId: string | undefined;
    if (mode === 'reassess') {
      assert(before.verifications.some(v => v.status === 'VERIFIED_SUCCESS'), 'Reassessment requires prior approved synthetic execution');
      assert(before.assets.some(a => a.id === `${incidentId}:app-host` && a.state === 'ISOLATED'), 'Reassessment fixture requires application-host isolation');
      assert(before.edges.some(e => e.fromId === `${incidentId}:jump-host` && e.toId === `${incidentId}:database` && e.enabled), 'Reassessment fixture requires remaining jump-host database route');
      const fixture = alternatePathEvidence(incidentId, 'not-an-authoritative-id', new Date().toISOString());
      const form = new FormData(); form.set('incidentId', incidentId); form.set('classification', 'SYNTHETIC'); form.set('modelApproved', 'true'); form.set('title', fixture.title); form.set('capturedAt', fixture.capturedAt); form.set('idempotencyKey', randomUUID()); form.set('correlationId', randomUUID());
      form.set('file', new Blob([fixture.redactedContent], { type: 'application/json' }), 'synthetic-post-isolation.json');
      const { response: uploaded, result } = await post('/api/evidence/upload', form);
      assert(uploaded.ok && result.ok && typeof result.data?.id === 'string', 'Synthetic evidence upload failed'); injectedEvidenceId = result.data.id;
    }
    const key = randomUUID();
    const command = { incidentId, objective: mode === 'reassess' ? 'Reassess after the newly uploaded synthetic post-isolation database audit. Search fresh evidence, inspect remaining paths and impact, cite the new observation and propose a current-version response with service costs.' : 'Investigate this synthetic credential compromise using evidence retrieval, graph and deterministic impact. Explain supported findings and propose a scoped response with uncertainty.', idempotencyKey: key };
    const { response, result } = await post('/api/investigations', JSON.stringify(command), 'application/json');
    // Give committed subscriptions bounded time to deliver terminal rows; not arbitrary success timing.
    const deadline = Math.min(Date.now() + 10000, window.deadline);
    while (Date.now() < deadline) {
      const state = snapshot();
      const observed = state.investigations.find(r => r.id === result.data?.runId);
      if (mode === 'outage' || observed && ['COMPLETED','FAILED','CANCELLED'].includes(observed.status)) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (mode === 'outage') {
      assert(!response.ok && result.ok === false && ['MODEL_UNAVAILABLE','RATE_LIMITED'].includes(result.error?.code), 'Expected honest provider outage response');
      verifyOutage(snapshot(), new Set(before.investigations.map(r => r.id)));
      console.log('PASS: deployed provider outage returned no findings/proposals/success.'); return;
    }
    assert(response.ok && result.ok && typeof result.data?.runId === 'string' && result.data.id === result.data.runId, 'Real investigation failed or returned noncanonical identity');
    const events = snapshot().streamEvents as DurableEvent[] | undefined;
    assert(events, 'Missing canonical snapshot streamEvents');
    const verified = verifyRealRun(snapshot(), events, result.data.runId, model, injectedEvidenceId);
    const countBeforeRetry = snapshot().toolRuns.filter(t => t.investigationId === verified.runId).length;
    const { response: retry, result: recovered } = await post('/api/investigations', JSON.stringify(command), 'application/json');
    assert(retry.ok && recovered.ok && recovered.data?.runId === verified.runId && recovered.data?.id === verified.runId, 'Completed same-key retry did not recover canonical result');
    assert.equal(snapshot().toolRuns.filter(t => t.investigationId === verified.runId).length, countBeforeRetry, 'Completed retry invoked new tools');
    const { response: read, result: readResult } = await request(`/api/incidents/${encodeURIComponent(incidentId)}/investigations/${encodeURIComponent(verified.runId)}`, { headers: { Authorization: `Bearer ${token}` } }, 10000);
    assert(read.ok && readResult.ok && readResult.data?.runId === verified.runId && readResult.data?.status === 'COMPLETED', 'Read-only run recovery failed');
    console.log(JSON.stringify({ outcome: 'PASS', mode, recovery: 'PASS', ...verified }));
  } finally { conn.disconnect(); }
}
main().catch(error => {
  // Only assertion/configuration descriptions written by this runner are safe to display.
  console.error(error instanceof AcceptanceLifetimeError ? `BLOCKED: ${error.message}` : error instanceof assert.AssertionError ? `FAIL: ${error.message}` : 'BLOCKED: deployed acceptance dependency/configuration failed; inspect server diagnostics privately.'); process.exitCode = 1;
});
