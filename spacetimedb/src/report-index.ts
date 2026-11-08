import type { ResponsePlan } from "../../src/lib/contracts";

/** Explicit projections exclude original/redacted bytes, storage references, and arbitrary nested keys. */
export function evidenceIndex(items: readonly { id: string; version: number; source: string; capturedAt: string; classification: string; sha256: string; redactedSha256: string; title: string; kind: string; assetIds: string[]; modelApproved: boolean; createdAt: string }[]) {
  return items.map(e => ({ id: e.id, version: e.version, title: e.title, kind: e.kind, source: e.source, capturedAt: e.capturedAt, classification: e.classification, sha256: e.sha256, redactedSha256: e.redactedSha256, assetIds: e.assetIds, modelApproved: e.modelApproved, createdAt: e.createdAt }));
}
export function planningIndex(json: string): ResponsePlan {
  const p = JSON.parse(json) as ResponsePlan;
  return { assumptions: p.assumptions, uncertainty: p.uncertainty, alternatives: p.alternatives.map(a => ({ action: { type: a.action.type, targetIds: a.action.targetIds }, rationale: a.rationale, tradeoffs: a.tradeoffs, ...(a.expectedImpact ? { expectedImpact: { reachableAssetIds: a.expectedImpact.reachableAssetIds, disruptedServiceIds: a.expectedImpact.disruptedServiceIds, unresolvedProtectedAssetIds: a.expectedImpact.unresolvedProtectedAssetIds, containmentCoverage: a.expectedImpact.containmentCoverage } } : {}) })) };
}
type ReportAction = { id: string; version: number; status: string; action: { type: string; targetIds: string[] }; rationale: string; evidenceIds: string[]; assumptions: string[]; uncertainty: string[]; expectedVersion: number; payloadDigest: string; simulationId?: string; planningJson?: string; investigationId?: string; requestedBy: string; createdAt: string; updatedAt: string };
export function actionIndex(items: readonly ReportAction[]) {
  return items.map(p => ({ id: p.id, version: p.version, status: p.status, type: p.action.type, targetIds: p.action.targetIds, rationale: p.rationale, evidenceIds: p.evidenceIds, assumptions: p.assumptions, uncertainty: p.uncertainty, expectedVersion: p.expectedVersion, payloadDigest: p.payloadDigest, simulationId: p.simulationId, ...(p.planningJson ? { planning: planningIndex(p.planningJson) } : {}), investigationId: p.investigationId, requestedBy: p.requestedBy, createdAt: p.createdAt, updatedAt: p.updatedAt }));
}
type ReportFinding = { id: string; investigationId: string; title: string; summary: string; confidence: string; verificationStatus: string; evidenceIds: string[]; assetIds: string[]; unknowns: string[]; recommendedNextQueries?: string[]; createdAt: string };
export function findingIndex(items: readonly ReportFinding[]) {
  return items.map(f => ({ id: f.id, investigationId: f.investigationId, title: f.title, summary: f.summary, confidence: f.confidence, verificationStatus: f.verificationStatus, evidenceIds: f.evidenceIds, assetIds: f.assetIds, unknowns: f.unknowns, recommendedNextQueries: f.recommendedNextQueries, createdAt: f.createdAt }));
}
export function findingReviews(events: readonly { id: string; verb: string; objectId: string; actorId: string; createdAt: string; detail: string; correlationId: string; hash: string }[]) {
  return events.filter(a => a.verb === "acceptFinding").map(a => ({ auditEventId: a.id, findingId: a.objectId, reviewedBy: a.actorId, reviewedAt: a.createdAt, reason: a.detail, correlationId: a.correlationId, auditHash: a.hash }));
}
export function reportUnknowns(findings: readonly Pick<ReportFinding, "unknowns">[], actions: readonly Pick<ReportAction, "uncertainty" | "planningJson">[]) {
  return [...new Set([...findings.flatMap(f => f.unknowns), ...actions.flatMap(p => [...p.uncertainty, ...(p.planningJson ? planningIndex(p.planningJson).uncertainty : [])])])];
}
