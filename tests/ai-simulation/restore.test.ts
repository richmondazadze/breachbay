import { test } from 'node:test';
import assert from 'node:assert/strict';
import { credentialCompromiseScenario } from '../../src/lib/simulation/scenario';
import { simulateResponse } from '../../src/lib/simulation/engine';
import type { Scenario } from '../../src/lib/simulation/types';
import { restoreScenario } from '../../src/lib/simulation/restore';
test('restoration appends a monotonic state version and reports reopened exposure', () => {
  const saved = credentialCompromiseScenario('a');
  const current = simulateResponse(saved, { type: 'ISOLATE_SIMULATED_HOST', targetIds: ['workstation'] }, 1).nextState;
  current.edges[0].evidenceIds.push('new-provenance');
  const inputs = structuredClone({ saved, current });
  const restored = restoreScenario(current, saved, 2);
  assert.equal(restored.nextState.version, 3); assert.equal(restored.restoredFromVersion, 1); assert.equal(restored.parentVersion, 2);
  assert.equal(restored.before.containmentCoverage, 1); assert.equal(restored.after.containmentCoverage, 0);
  assert(restored.warnings.some(w => w.includes('reopens')));
  assert(restored.nextState.edges[0].evidenceIds.includes('new-provenance'));
  assert.deepEqual({ saved, current }, inputs);
  assert.deepEqual(restored, restoreScenario(current, saved, 2));
});
test('restoration rejects stale, foreign, future, rewired and malformed snapshots', () => {
  const s = credentialCompromiseScenario('a');
  assert.throws(() => restoreScenario(s, s, 2), /changed/);
  for (const modify of [
    (s: Scenario) => { s.incidentId = 'foreign'; },
    (s: Scenario) => { s.seed = 'different'; },
    (s: Scenario) => { s.version = 3; },
    (s: Scenario) => { s.edges[0].to = 'database'; },
    (s: Scenario) => { s.assets[0].credentialEnabled = 'bad' as unknown as boolean; },
  ]) { const snapshot = structuredClone(s); modify(snapshot); assert.throws(() => restoreScenario(s, snapshot, 1)); }
  s.version = Number.MAX_SAFE_INTEGER;
  assert.throws(() => restoreScenario(s, s, s.version), /exhausted/);
});
test('snapshot row order is irrelevant and repeated restoration still advances version', () => {
  const s = credentialCompromiseScenario('a'); const reordered = structuredClone(s);
  reordered.assets.reverse(); reordered.edges.reverse();
  const first = restoreScenario(s, reordered, 1);
  assert.equal(first.assetChanges.length, 0); assert.equal(first.edgeChanges.length, 0); assert.equal(first.nextState.version, 2);
  assert.equal(restoreScenario(first.nextState, s, 2).nextState.version, 3);
});
