import type { Scenario } from './types';
export function credentialCompromiseScenario(incidentId: string): Scenario {
  const names = ['workstation', 'app-host', 'database', 'customer-portal', 'jump-host', 'backup-service'];
  return { incidentId, version: 1, seed: 'breachbay-credential-compromise-v1', synthetic: true,
    assets: names.map(id => ({ id, name: `Synthetic ${id}`, criticality: id === 'database' ? 'CRITICAL' : id === 'customer-portal' ? 'HIGH' : 'MEDIUM', state: 'ACTIVE', credentialEnabled: true })),
    compromisedAssetIds: ['workstation'], protectedAssetIds: ['database'],
    edges: [
      { id: 'ws-app', from: 'workstation', to: 'app-host', type: 'COMMUNICATES_WITH', enabled: true, credentialId: 'workstation', evidenceIds: ['ev-login', 'ev-lateral'] },
      { id: 'app-db', from: 'app-host', to: 'database', type: 'COMMUNICATES_WITH', enabled: true, credentialId: 'app-host', evidenceIds: ['ev-db'] },
      { id: 'ws-jump', from: 'workstation', to: 'jump-host', type: 'COMMUNICATES_WITH', enabled: true, credentialId: 'workstation', evidenceIds: ['ev-alternate'] },
      { id: 'jump-db', from: 'jump-host', to: 'database', type: 'COMMUNICATES_WITH', enabled: true, evidenceIds: ['ev-alternate'] },
      { id: 'portal-app', from: 'customer-portal', to: 'app-host', type: 'DEPENDS_ON', enabled: true, evidenceIds: ['ev-inventory'] },
      { id: 'app-dep-db', from: 'app-host', to: 'database', type: 'DEPENDS_ON', enabled: true, evidenceIds: ['ev-inventory'] },
      { id: 'backup-db', from: 'backup-service', to: 'database', type: 'DEPENDS_ON', enabled: true, evidenceIds: ['ev-inventory'] },
    ] };
}
