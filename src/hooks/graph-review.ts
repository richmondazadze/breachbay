import type { GraphEdge, GraphEdgeReviewPreparation, IncidentSnapshot, Finding } from "@/lib/contracts";

export const reviewableRelationshipTypes = ["OBSERVED_ON", "INDICATES", "AFFECTS", "SUPPORTED_BY", "TARGETS", "MITIGATES"] as const;
export function parseGraphReviewPreparation(json: string, incidentId: string, edgeId: string): GraphEdgeReviewPreparation {
  if (json.length > 20000) throw new Error("Review preparation exceeds display limits.");
  const value = JSON.parse(json);
  if (!value || value.incidentId !== incidentId || value.edgeId !== edgeId || typeof value.expectedEdgeDigest !== "string" || !/^[a-f0-9]{64}$/.test(value.expectedEdgeDigest) || !Array.isArray(value.evidenceRefs)) throw new Error("Review preparation scope or digest is invalid.");
  const evidenceRefs = value.evidenceRefs.map((ref: Record<string, unknown>) => {
    if (!ref || typeof ref.evidenceId !== "string" || !Number.isInteger(ref.version) || (ref.version as number) < 1 || typeof ref.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(ref.sha256) || typeof ref.redactedSha256 !== "string" || !/^[a-f0-9]{64}$/.test(ref.redactedSha256)) throw new Error("Invalid review evidence reference.");
    return { evidenceId: ref.evidenceId, version: ref.version as number, sha256: ref.sha256, redactedSha256: ref.redactedSha256 };
  });
  if (new Set(evidenceRefs.map((ref: { evidenceId: string }) => ref.evidenceId)).size !== evidenceRefs.length) throw new Error("Duplicate review evidence reference.");
  return { incidentId, edgeId, expectedEdgeDigest: value.expectedEdgeDigest, evidenceRefs };
}
export function reviewPreparationMatches(snapshot: IncidentSnapshot, edge: GraphEdge, preparation: GraphEdgeReviewPreparation) {
  return preparation.incidentId === snapshot.incident.id && edge.incidentId === snapshot.incident.id && preparation.edgeId === edge.id && preparation.evidenceRefs.length === edge.sourceEvidenceIds.length && preparation.evidenceRefs.every(ref => {
    const evidence = snapshot.evidence.find(item => item.id === ref.evidenceId && item.incidentId === snapshot.incident.id);
    return edge.sourceEvidenceIds.includes(ref.evidenceId) && evidence?.version === ref.version && evidence.sha256 === ref.sha256 && evidence.redactedSha256 === ref.redactedSha256;
  });
}
export function supportingReviewedFindings(snapshot: IncidentSnapshot, edge: GraphEdge): Finding[] {
  if (!edge.sourceEvidenceIds.length || edge.incidentId !== snapshot.incident.id || !reviewableRelationshipTypes.some(type => type === edge.type)) return [];
  return snapshot.findings.filter(finding => finding.incidentId === snapshot.incident.id && finding.verificationStatus === "VERIFIED" && edge.sourceEvidenceIds.every(id => finding.evidenceIds.includes(id)));
}
export function canVerifyGraphRelationship(snapshot: IncidentSnapshot, edge: GraphEdge, userId?: string, findingId?: string) {
  return edge.verificationStatus === "HYPOTHESIS" && edge.assertedBy !== userId && snapshot.memberships.some(member => member.active && member.userId === userId && member.role === "COMMANDER" && member.capabilities.includes("MANAGE_INCIDENT")) && supportingReviewedFindings(snapshot, edge).some(finding => finding.id === findingId);
}
