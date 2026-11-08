import type { SanitizedEvidence } from './evidence';
import { OutputValidationError } from './diagnostics';
/** IDs become citation-eligible only after approved excerpts were returned by search_evidence. */
export function citationManifest(evidence: SanitizedEvidence[], retrievedIds: Set<string>, incidentId: string) {
  return evidence.filter(e => e.incidentId === incidentId && retrievedIds.has(e.id)).map(e => ({ evidenceId: e.id, version: e.version, sha256: e.sha256 })).sort((a,b)=>a.evidenceId.localeCompare(b.evidenceId));
}
export function mayCorrectCitation(error: unknown, step: number, correctionCount: number) {
  return error instanceof OutputValidationError && error.diagnostic.reason === 'CITATION_NOT_RETRIEVED' && correctionCount < 1 && step < 7;
}
