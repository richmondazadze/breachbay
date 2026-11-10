import type { IncidentSnapshot } from "../contracts";
import type { OperationalResponse } from "./contract";
import { canonical, sha256 } from "../../../spacetimedb/src/hash";

/** Checked again immediately before dispatch; receipt recovery does not need a new effect. */
export function canDispatchResponse(snapshot: IncidentSnapshot, response: OperationalResponse, now: number) {
  const approver = snapshot.memberships.find(g => g.userId === response.approvalBy && g.active);
  const requester = snapshot.memberships.find(g => g.userId === response.requestedBy && g.active);
  const target = snapshot.operationalTargets?.find(t => t.id === response.targetId);
  const current = snapshot.operationalResponses?.find(r => r.id === response.id);
  const digest = sha256(canonical({
    incidentId: response.incidentId, targetId: response.targetId, operation: response.operation,
    targetVersion: response.expectedTargetVersion, stateVersion: response.expectedStateVersion,
    instanceId: response.instanceId, previewDigest: sha256(response.previewJson),
    evidence: response.evidenceIds.map(id => {
      const evidence = snapshot.evidence.find(e => e.id === id);
      return { id, version: evidence?.version, sha256: evidence?.redactedSha256 };
    }), rationale: response.rationale,
  }));
  return snapshot.incident.id === response.incidentId && !!target?.active
    && target.version === response.expectedTargetVersion && target.instanceId === response.instanceId
    && !!current?.executionId && current.executionId === response.executionId
    && ["EXECUTING", "UNCONFIRMED"].includes(current.status) && current.payloadDigest === response.payloadDigest
    && !["RESOLVED", "ARCHIVED"].includes(snapshot.incident.status)
    && approver?.role === "COMMANDER" && !!requester?.capabilities.includes("PROPOSE")
    && response.approvalBy !== response.requestedBy
    && Date.parse(response.approvalExpiresAt ?? "") > now && digest === response.payloadDigest;
}
