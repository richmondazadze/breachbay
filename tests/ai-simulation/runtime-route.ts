/** Run against an actual Next application; no mock inference or authentication. */
import assert from 'node:assert/strict';
const origin = process.env.AI_ROUTE_TEST_ORIGIN ?? 'http://localhost:3000';
async function check() {
  const url = new URL('/api/investigations', origin);
  for (const body of ['not json', JSON.stringify({ incidentId: 'synthetic-negative-test' })]) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body });
    assert.equal(response.status, 400);
    const result = await response.json(); assert.equal(result.ok, false); assert.equal(result.error.code, 'INVALID_INPUT'); assert.equal(typeof result.correlationId, 'string');
  }
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ incidentId: 'synthetic-negative-test', objective: 'Investigate synthetic incident', idempotencyKey: 'negative-route-check' }) });
  const result = await response.json();
  assert([401,403,503].includes(response.status));
  assert(['UNAUTHENTICATED','FORBIDDEN','DEPENDENCY_UNAVAILABLE'].includes(result.error.code));
  assert.equal(result.ok, false); assert(!result.data);
  console.log(`Actual application route: malformed requests denied; unauthenticated request denied (${response.status}/${result.error.code}). No provider call or model success asserted.`);
}
check().catch(() => { console.error('Actual application route negative checks failed'); process.exitCode = 1; });
