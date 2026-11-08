import { calculateImpact, SimulationError, validateScenario } from './engine';
import type { Impact, Scenario, SimAsset } from './types';
export interface RestorePreview {
  incidentId: string; parentVersion: number; restoredFromVersion: number; scenarioSeed: string;
  before: Impact; after: Impact;
  assetChanges: { assetId: string; before: Pick<SimAsset, 'state' | 'credentialEnabled'>; after: Pick<SimAsset, 'state' | 'credentialEnabled'> }[];
  edgeChanges: { edgeId: string; before: boolean; after: boolean }[];
  warnings: string[]; nextState: Scenario;
}
/** Pure synthetic restoration preview. Persist only through backend human/version-guarded transaction. */
export function restoreScenario(current: Scenario, saved: Scenario, expectedVersion: number): RestorePreview {
  validateScenario(current); validateScenario(saved);
  if (current.version !== expectedVersion) throw new SimulationError('VERSION_CONFLICT', 'Scenario changed; preview restoration again');
  if (current.incidentId !== saved.incidentId || current.seed !== saved.seed || saved.version > current.version) throw new SimulationError('SIMULATION_FAILED', 'Snapshot identity, seed or historical version mismatch');
  if (!Number.isSafeInteger(current.version + 1)) throw new SimulationError('SIMULATION_FAILED', 'Scenario version exhausted');
  // Restore mutable state only. Current provenance stays attached; never delete evidence/history.
  const shape = (s: Scenario) => JSON.stringify({ assets: s.assets.map(a => [a.id,a.name,a.criticality]).sort(), edges: s.edges.map(e => [e.id,e.from,e.to,e.type,e.credentialId ?? null]).sort(), roots: [...s.compromisedAssetIds].sort(), protected: [...s.protectedAssetIds].sort() });
  if (shape(current) !== shape(saved)) throw new SimulationError('SIMULATION_FAILED', 'Snapshot topology or scenario definition differs');
  const next = structuredClone(current);
  next.version = current.version + 1;
  const assetChanges: RestorePreview['assetChanges'] = [];
  const edgeChanges: RestorePreview['edgeChanges'] = [];
  for (const asset of next.assets) {
    const source = saved.assets.find(a => a.id === asset.id)!;
    if (source.state !== asset.state || source.credentialEnabled !== asset.credentialEnabled) assetChanges.push({ assetId: asset.id, before: { state: asset.state, credentialEnabled: asset.credentialEnabled }, after: { state: source.state, credentialEnabled: source.credentialEnabled } });
    asset.state = source.state; asset.credentialEnabled = source.credentialEnabled;
  }
  for (const edge of next.edges) {
    const source = saved.edges.find(e => e.id === edge.id)!;
    if (edge.enabled !== source.enabled) edgeChanges.push({ edgeId: edge.id, before: edge.enabled, after: source.enabled });
    edge.enabled = source.enabled;
  }
  const before = calculateImpact(current), after = calculateImpact(next);
  return { incidentId: current.incidentId, parentVersion: current.version, restoredFromVersion: saved.version, scenarioSeed: current.seed, before, after, assetChanges: assetChanges.sort((a,b) => a.assetId.localeCompare(b.assetId)), edgeChanges: edgeChanges.sort((a,b) => a.edgeId.localeCompare(b.edgeId)), warnings: ['Synthetic restoration creates a new version; previous actions and evidence remain historical.', ...(after.containmentCoverage < before.containmentCoverage ? ['Restoration reopens modeled exposure paths.'] : [])], nextState: next };
}
