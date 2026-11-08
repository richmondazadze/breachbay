import { createHash } from 'node:crypto';
import type { Evidence } from '../contracts';
/** Synthetic second injection: a new observation, not a retroactive invented graph path. */
export function alternatePathEvidence(incidentId: string, evidenceId: string, capturedAt: string): Evidence {
  const content = JSON.stringify({ eventType: 'SYNTHETIC_DATABASE_LOGIN', sourceAssetId: `${incidentId}:jump-host`, destinationAssetId: `${incidentId}:database`, assetId: `${incidentId}:jump-host`, indicator: 'synthetic-session-reuse', outcome: 'ALLOWED', description: 'Synthetic database audit recorded a successful jump-host session after app-host isolation. The known alternate path remains active; isolating app-host alone did not contain database exposure.' });
  const sha256 = createHash('sha256').update(content).digest('hex');
  return { id: evidenceId, incidentId, kind: 'LOG', title: 'Synthetic post-isolation database session', source: 'Synthetic database audit', capturedAt, createdAt: capturedAt, sha256, redactedSha256: sha256, classification: 'SYNTHETIC', redactedContent: content, modelApproved: true, assetIds: [`${incidentId}:jump-host`, `${incidentId}:database`], version: 1 };
}
