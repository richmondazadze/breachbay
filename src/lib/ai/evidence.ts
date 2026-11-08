import { OutputValidationError } from './diagnostics';
import { createHash } from 'node:crypto';
export interface SanitizedEvidence { id: string; incidentId: string; version: number; source: string; capturedAt: string; excerpt: string; sha256: string }
export const sanitizeFreeText = (s: string) => s
  .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
  .replace(/\b(?:password|passwd|token|secret|api[_-]?key|authorization)\b\s*[=:]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '[REDACTED SECRET]')
  .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED EMAIL]')
  .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]');
/** Derive external-model content from explicitly permitted synthetic fields only. */
export function sanitizeEvidence(record: { id: string; incidentId: string; version: number; source: string; capturedAt: string; synthetic: boolean; fields: Record<string, unknown> }): SanitizedEvidence {
  if (record.synthetic !== true) throw new Error('Only approved synthetic evidence is supported');
  const allowed = ['eventType', 'assetId', 'sourceAssetId', 'destinationAssetId', 'indicator', 'outcome', 'description'];
  const fields = Object.fromEntries(allowed.filter(key => typeof record.fields[key] === 'string').map(key => [key, sanitizeFreeText(String(record.fields[key])).slice(0, 1500)]));
  const excerpt = JSON.stringify(fields);
  return { id: record.id, incidentId: record.incidentId, version: record.version, source: sanitizeFreeText(record.source).slice(0, 200), capturedAt: record.capturedAt, excerpt, sha256: createHash('sha256').update(excerpt).digest('hex') };
}
export interface Finding { summary: string; confidence: 'LOW' | 'MEDIUM' | 'HIGH'; evidenceIds: string[]; unknowns: string[]; recommendedNextQueries?: string[] }
export function validateFindings(value: unknown, incidentId: string, evidence: SanitizedEvidence[]): Finding[] {
  if (!Array.isArray(value) || value.length > 12) throw new OutputValidationError({ stage: 'FINDINGS', reason: 'FINDINGS_SHAPE_INVALID' });
  const authorized = new Set(evidence.filter(e => e.incidentId === incidentId).map(e => e.id));
  return value.map(raw => {
    if (!raw || typeof raw !== 'object') throw new OutputValidationError({ stage: 'FINDINGS', reason: 'FINDINGS_SHAPE_INVALID' });
    const f = raw as Finding;
    if (typeof f.summary !== 'string' || !f.summary.trim() || f.summary.length > 2000 || !['LOW','MEDIUM','HIGH'].includes(f.confidence) || !Array.isArray(f.evidenceIds) || !f.evidenceIds.length || !Array.isArray(f.unknowns) || f.unknowns.some(u => typeof u !== 'string' || u.length > 1000)) throw new OutputValidationError({ stage: 'FINDINGS', reason: 'FINDING_FIELDS_INVALID' });
    if (f.evidenceIds.some(id => typeof id !== 'string' || !authorized.has(id))) throw new OutputValidationError({ stage: 'FINDINGS', reason: 'CITATION_NOT_RETRIEVED' });
    if (f.recommendedNextQueries !== undefined && (!Array.isArray(f.recommendedNextQueries) || f.recommendedNextQueries.length > 5 || f.recommendedNextQueries.some(q => typeof q !== 'string' || !q.trim() || q.length > 200))) throw new OutputValidationError({ stage: 'FINDINGS', reason: 'NEXT_QUERIES_INVALID' });
    return { ...(f.recommendedNextQueries ? { recommendedNextQueries: f.recommendedNextQueries.map(sanitizeFreeText) } : {}), summary: f.summary, confidence: f.confidence, evidenceIds: [...new Set(f.evidenceIds)], unknowns: f.unknowns };
  });
}

/** Digest exact model-supplied tool argument bytes without exposing their contents. */
export function toolArgumentsDigest(argumentsJson: string): string {
  return createHash("sha256").update(argumentsJson).digest("hex");
}
