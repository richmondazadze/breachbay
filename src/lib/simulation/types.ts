/** All data in this module represents synthetic scenarios only. */
export interface SimAsset { id: string; name: string; criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; state: 'ACTIVE' | 'ISOLATED'; credentialEnabled: boolean }
export interface SimEdge { id: string; from: string; to: string; type: 'COMMUNICATES_WITH' | 'DEPENDS_ON'; enabled: boolean; evidenceIds: string[]; credentialId?: string }
export interface Scenario { incidentId: string; version: number; seed: string; synthetic: true; assets: SimAsset[]; edges: SimEdge[]; compromisedAssetIds: string[]; protectedAssetIds: string[] }
export type SimAction = { type: 'ISOLATE_SIMULATED_HOST' | 'BLOCK_SIMULATED_ROUTE' | 'RESET_SIMULATED_CREDENTIAL'; targetIds: string[] };
export interface Impact { reachableAssetIds: string[]; disruptedServiceIds: string[]; unresolvedProtectedAssetIds: string[]; containmentCoverage: number }
export interface Preview { incidentId: string; parentVersion: number; scenarioSeed: string; action: SimAction; before: Impact; after: Impact; changedAssetIds: string[]; changedEdgeIds: string[]; warnings: string[]; nextState: Scenario }
