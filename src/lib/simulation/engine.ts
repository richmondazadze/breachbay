import type { Impact, Preview, Scenario, SimAction } from './types';
export class SimulationError extends Error {
  constructor(public code: 'VERSION_CONFLICT' | 'SIMULATION_FAILED', message: string) { super(message); }
}
const sorted = (values: Iterable<string>) => [...new Set(values)].sort();
export function validateScenario(s: Scenario): void {
  if (s.synthetic !== true || !s.incidentId || !s.seed || !Number.isSafeInteger(s.version) || s.version < 0) throw new SimulationError('SIMULATION_FAILED', 'Invalid synthetic scenario');
  if (!Array.isArray(s.assets) || !Array.isArray(s.edges) || !Array.isArray(s.compromisedAssetIds) || !Array.isArray(s.protectedAssetIds)) throw new SimulationError('SIMULATION_FAILED', 'Invalid scenario collections');
  if (s.assets.some(a => !a || typeof a.id !== 'string' || typeof a.name !== 'string' || !['LOW','MEDIUM','HIGH','CRITICAL'].includes(a.criticality) || !['ACTIVE','ISOLATED'].includes(a.state) || typeof a.credentialEnabled !== 'boolean')) throw new SimulationError('SIMULATION_FAILED', 'Invalid asset state');
  const ids = new Set(s.assets.map(a => a.id));
  if (ids.size !== s.assets.length || s.assets.some(a => !a.id)) throw new SimulationError('SIMULATION_FAILED', 'Duplicate or empty asset ID');
  if (s.edges.some(e => !e || typeof e.id !== 'string' || !['COMMUNICATES_WITH','DEPENDS_ON'].includes(e.type) || typeof e.enabled !== 'boolean' || !Array.isArray(e.evidenceIds) || e.evidenceIds.some(id => typeof id !== 'string') || e.credentialId !== undefined && !ids.has(e.credentialId))) throw new SimulationError('SIMULATION_FAILED', 'Invalid edge state or credential attribution');
  if (new Set(s.edges.map(e => e.id)).size !== s.edges.length || s.edges.some(e => !e.id || !ids.has(e.from) || !ids.has(e.to))) throw new SimulationError('SIMULATION_FAILED', 'Invalid graph edges');
  if ([...s.compromisedAssetIds, ...s.protectedAssetIds].some(id => !ids.has(id))) throw new SimulationError('SIMULATION_FAILED', 'Unknown scenario endpoint');
}
export function calculateImpact(s: Scenario): Impact {
  validateScenario(s);
  const active = new Set(s.assets.filter(a => a.state === 'ACTIVE').map(a => a.id));
  const reachable = new Set(s.compromisedAssetIds.filter(id => active.has(id)));
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of s.edges) if (e.type === 'COMMUNICATES_WITH' && e.enabled && active.has(e.from) && active.has(e.to) && reachable.has(e.from) && !reachable.has(e.to)) { reachable.add(e.to); changed = true; }
  }
  // DEPENDS_ON is directed consumer -> dependency. Propagate unavailable dependencies transitively.
  const unavailable = new Set(s.assets.filter(a => a.state !== 'ACTIVE').map(a => a.id));
  changed = true;
  while (changed) {
    changed = false;
    for (const e of s.edges) if (e.type === 'DEPENDS_ON' && (!e.enabled || unavailable.has(e.to)) && !unavailable.has(e.from)) { unavailable.add(e.from); changed = true; }
  }
  return { reachableAssetIds: sorted(reachable), disruptedServiceIds: sorted(unavailable), unresolvedProtectedAssetIds: sorted(s.protectedAssetIds.filter(id => reachable.has(id))), containmentCoverage: s.protectedAssetIds.length ? 1 - s.protectedAssetIds.filter(id => reachable.has(id)).length / s.protectedAssetIds.length : 1 };
}
/** Pure preview. Caller must enforce authorization; this does not persist or approve actions. */
export function simulateResponse(s: Scenario, action: SimAction, expectedVersion: number): Preview {
  validateScenario(s);
  if (expectedVersion !== s.version) throw new SimulationError('VERSION_CONFLICT', 'Scenario changed; resimulate and reapprove');
  if (!['ISOLATE_SIMULATED_HOST', 'BLOCK_SIMULATED_ROUTE', 'RESET_SIMULATED_CREDENTIAL'].includes(action.type) || !action.targetIds.length || new Set(action.targetIds).size !== action.targetIds.length) throw new SimulationError('SIMULATION_FAILED', 'Invalid action');
  const next: Scenario = structuredClone(s);
  const targets = new Set(action.targetIds);
  const allowed = action.type === 'BLOCK_SIMULATED_ROUTE' ? new Set(s.edges.filter(e => e.type === 'COMMUNICATES_WITH').map(e => e.id)) : new Set(s.assets.map(a => a.id));
  if (action.targetIds.some(id => !allowed.has(id))) throw new SimulationError('SIMULATION_FAILED', 'Target outside synthetic scenario');
  for (const a of next.assets) if (targets.has(a.id)) {
    if (action.type === 'ISOLATE_SIMULATED_HOST') a.state = 'ISOLATED';
    if (action.type === 'RESET_SIMULATED_CREDENTIAL') a.credentialEnabled = false;
  }
  for (const e of next.edges) if (e.type === 'COMMUNICATES_WITH' && (
    action.type === 'BLOCK_SIMULATED_ROUTE' && targets.has(e.id) ||
    action.type === 'ISOLATE_SIMULATED_HOST' && (targets.has(e.from) || targets.has(e.to)) ||
    action.type === 'RESET_SIMULATED_CREDENTIAL' && !!e.credentialId && targets.has(e.credentialId)
  )) e.enabled = false;
  if (!Number.isSafeInteger(next.version + 1)) throw new SimulationError('SIMULATION_FAILED', 'Scenario version exhausted');
  next.version++;
  const after = calculateImpact(next);
  return { incidentId: s.incidentId, parentVersion: s.version, scenarioSeed: s.seed, action: { ...action, targetIds: sorted(action.targetIds) }, before: calculateImpact(s), after,
    changedAssetIds: sorted(next.assets.filter((a, i) => JSON.stringify(a) !== JSON.stringify(s.assets[i])).map(a => a.id)),
    changedEdgeIds: sorted(next.edges.filter((e, i) => e.enabled !== s.edges[i].enabled).map(e => e.id)),
    warnings: ['Synthetic model estimate; not a real-world containment guarantee.', ...(after.unresolvedProtectedAssetIds.length ? ['Alternate spread paths remain unresolved.'] : [])], nextState: next };
}
/** Same rules as preview. Only the backend's approved transaction may persist this state. */
export const executeSyntheticAction = simulateResponse;
export function verifyExecution(expected: Scenario, observed: Scenario): { status: 'VERIFIED_SUCCESS' | 'VERIFIED_PARTIAL' | 'VERIFIED_FAILED'; mismatches: string[] } {
  validateScenario(expected); validateScenario(observed);
  const normalize = (s: Scenario) => JSON.stringify({ ...s, assets: [...s.assets].sort((a,b) => a.id.localeCompare(b.id)), edges: [...s.edges].sort((a,b) => a.id.localeCompare(b.id)), compromisedAssetIds: sorted(s.compromisedAssetIds), protectedAssetIds: sorted(s.protectedAssetIds) });
  if (normalize(expected) === normalize(observed)) return { status: 'VERIFIED_SUCCESS', mismatches: [] };
  const mismatches: string[] = [];
  if (expected.incidentId !== observed.incidentId || expected.seed !== observed.seed || expected.version !== observed.version) mismatches.push('Scenario identity or version mismatch');
  for (const a of expected.assets) if (JSON.stringify(a) !== JSON.stringify(observed.assets.find(x => x.id === a.id))) mismatches.push(`Asset mismatch: ${a.id}`);
  for (const e of expected.edges) if (JSON.stringify(e) !== JSON.stringify(observed.edges.find(x => x.id === e.id))) mismatches.push(`Edge mismatch: ${e.id}`);
  if (!mismatches.length) mismatches.push('Scenario membership or scope mismatch');
  return { status: mismatches.some(m => m.startsWith('Scenario')) ? 'VERIFIED_FAILED' : 'VERIFIED_PARTIAL', mismatches };
}
