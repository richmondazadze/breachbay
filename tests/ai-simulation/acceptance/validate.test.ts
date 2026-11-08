/** Tests rejection of incomplete acceptance records, not scripted model/provider success. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyOutage, verifyRealRun } from './validate';
import type { IncidentSnapshot } from '../../../src/lib/contracts';
const empty = () => ({ incident: { id: 'a', scenarioVersion: 1 }, investigations: [], toolRuns: [], findings: [], proposals: [], auditEvents: [], evidence: [] } as unknown as IncidentSnapshot);
test('acceptance rejects absent real canonical investigation', () => {
  assert.throws(() => verifyRealRun(empty(), [], 'missing', 'nemotron'), /persisted investigation/);
});
test('outage acceptance rejects fabricated completion or abandoned jobs', () => {
  const snapshot = empty();
  snapshot.investigations = [{ id: 'new', status: 'COMPLETED' }] as IncidentSnapshot['investigations'];
  assert.throws(() => verifyOutage(snapshot, new Set()), /completed investigation/);
  snapshot.investigations = [{ id: 'new', status: 'RUNNING' }] as IncidentSnapshot['investigations'];
  assert.throws(() => verifyOutage(snapshot, new Set()), /abandoned run/);
});
