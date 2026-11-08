import type { ActionPayload, Asset, GraphEdge, IncidentSnapshot, SimulationDiff } from '../contracts';
import { simulateResponse } from './engine';
import type { Scenario } from './types';
/** Converts the authoritative scoped snapshot; no fixture data is injected. */
export function scenarioFromSnapshot(snapshot: IncidentSnapshot): Scenario {
  if (snapshot.incident.classification !== 'SYNTHETIC' || snapshot.assets.some(a => a.incidentId !== snapshot.incident.id) || snapshot.edges.some(e => e.incidentId !== snapshot.incident.id)) throw new Error('Synthetic scoped snapshot required');
  return { incidentId: snapshot.incident.id, version: snapshot.incident.scenarioVersion, seed: snapshot.incident.scenarioId, synthetic: true,
    assets: snapshot.assets.map(a => ({ id: a.id, name: a.name, criticality: a.criticality, state: ['ISOLATED','OFFLINE'].includes(a.state) ? 'ISOLATED' : 'ACTIVE', credentialEnabled: !a.riskLabels.includes('CREDENTIAL_DISABLED') })),
    edges: snapshot.edges.filter(e => ['COMMUNICATES_WITH','DEPENDS_ON'].includes(e.type) && e.verificationStatus === 'VERIFIED').map(e => ({ id: e.id, from: e.fromId, to: e.toId, type: e.type as 'COMMUNICATES_WITH' | 'DEPENDS_ON', enabled: e.enabled, evidenceIds: e.sourceEvidenceIds, credentialId: e.credentialId })),
    compromisedAssetIds: snapshot.assets.filter(a => a.state === 'COMPROMISED').map(a => a.id),
    protectedAssetIds: snapshot.assets.filter(a => a.criticality === 'CRITICAL').map(a => a.id) };
}
function paths(s: Scenario): string[][] {
  const output: string[][] = [];
  const active = new Set(s.assets.filter(a => a.state === 'ACTIVE').map(a => a.id));
  const visit = (path: string[]) => {
    const last = path[path.length - 1];
    if (s.protectedAssetIds.includes(last)) { output.push(path); return; }
    if (output.length >= 100) return;
    for (const e of [...s.edges].sort((a,b) => a.id.localeCompare(b.id))) if (e.type === 'COMMUNICATES_WITH' && e.enabled && e.from === last && active.has(e.to) && !path.includes(e.to)) visit([...path, e.to]);
  };
  for (const id of [...s.compromisedAssetIds].sort()) if (active.has(id)) visit([id]);
  return output;
}
export function previewSnapshot(snapshot: IncidentSnapshot, action: ActionPayload, expectedVersion: number): { diff: SimulationDiff; assets: Asset[]; edges: GraphEdge[]; nextVersion: number } {
  const scenario = scenarioFromSnapshot(snapshot);
  // BLOCK targets are edge IDs. Route selectors must agree with those targets.
  if (action.route && (action.type !== 'BLOCK_SIMULATED_ROUTE' || action.targetIds.some(id => !scenario.edges.some(e => e.id === id && e.from === action.route!.fromId && e.to === action.route!.toId)))) throw new Error('Invalid route selector');
  const preview = simulateResponse(scenario, action, expectedVersion);
  const assets = snapshot.assets.map(a => {
    const next = preview.nextState.assets.find(x => x.id === a.id)!;
    const state = next.state === 'ISOLATED' ? 'ISOLATED' : preview.after.disruptedServiceIds.includes(a.id) ? 'DEGRADED' : a.state;
    const riskLabels = next.credentialEnabled ? a.riskLabels : [...new Set([...a.riskLabels, 'CREDENTIAL_DISABLED'])];
    return { ...a, state, riskLabels, version: a.version + (state !== a.state || riskLabels.length !== a.riskLabels.length ? 1 : 0) } as Asset;
  });
  const edges = snapshot.edges.map(e => ({ ...e, enabled: preview.nextState.edges.find(x => x.id === e.id)?.enabled ?? e.enabled }));
  return { assets, edges, nextVersion: preview.nextState.version, diff: {
    assetChanges: assets.filter((a,i) => a.state !== snapshot.assets[i].state).map((a,i) => ({ assetId: a.id, before: snapshot.assets.find(x => x.id === a.id)!.state, after: a.state })),
    edgeChanges: edges.filter(e => e.enabled !== snapshot.edges.find(x => x.id === e.id)!.enabled).map(e => ({ edgeId: e.id, before: snapshot.edges.find(x => x.id === e.id)!.enabled, after: e.enabled })),
    disruptedServiceIds: preview.after.disruptedServiceIds, containedAssetIds: preview.before.reachableAssetIds.filter(id => !preview.after.reachableAssetIds.includes(id)), unresolvedPaths: paths(preview.nextState), containmentCoverage: preview.after.containmentCoverage, warnings: preview.warnings } };
}
