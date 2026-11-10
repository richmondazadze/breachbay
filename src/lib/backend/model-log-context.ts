import { createHash } from "node:crypto";
import type { Evidence, IncidentSnapshot } from "../contracts";
import { validateObservationBatch } from "../evidence/import-manifest";
import type { OperationalContext } from "../ai/operational-investigation";
import type { SanitizedEvidence } from "../ai/evidence";

export function approvedLogExcerpt(e: Evidence): SanitizedEvidence {
  if (!e.modelApproved || e.classification === "SYNTHETIC") throw new Error("Unapproved operational evidence");
  const content = JSON.parse(e.redactedContent);
  if (content.schema !== "breachbay.observations.v1") throw new Error("Invalid approved derivative");
  const events = validateObservationBatch(content.events);
  for (const o of events) for (const id of [o.host, o.sourceHost, o.destinationHost]) if (id && (!/^asset_[a-f0-9]{64}$/.test(id) || !e.assetIds.includes(id))) throw new Error("Unapproved host reference");
  const hash = createHash("sha256").update(e.redactedContent).digest("hex");
  if (hash !== e.redactedSha256) throw new Error("Derivative integrity mismatch");
  return { id: e.id, incidentId: e.incidentId, version: e.version, source: "Approved event log", capturedAt: e.capturedAt, excerpt: e.redactedContent, sha256: hash };
}

export function operationalModelContext(snapshot: IncidentSnapshot): OperationalContext {
  if (snapshot.incident.scenarioId !== "evidence-driven" || snapshot.incident.classification === "SYNTHETIC") throw new Error("Operational incident required");
  const records = snapshot.evidence.filter(e => e.modelApproved && e.classification !== "SYNTHETIC");
  const allowedEvidence = new Set(records.map(e => e.id)), allowedAssets = new Set(records.flatMap(e => e.assetIds));
  return {
    incidentId: snapshot.incident.id, classification: snapshot.incident.classification === "RESTRICTED" || records.some(e => e.classification === "RESTRICTED") ? "RESTRICTED" : "INTERNAL",
    evidence: records.map(approvedLogExcerpt),
    graph: { version: snapshot.incident.scenarioVersion,
      assets: snapshot.assets.filter(a => allowedAssets.has(a.id)).map(a => ({ id: a.id, type: a.type, state: a.state, lastSeen: a.lastSeen })),
      edges: snapshot.edges.filter(e => allowedAssets.has(e.fromId) && allowedAssets.has(e.toId) && e.sourceEvidenceIds.some(id => allowedEvidence.has(id))).map(e => ({ id: e.id, fromId: e.fromId, toId: e.toId, type: e.type, verificationStatus: e.verificationStatus, sourceEvidenceIds: e.sourceEvidenceIds.filter(id => allowedEvidence.has(id)) })),
    },
  };
}
