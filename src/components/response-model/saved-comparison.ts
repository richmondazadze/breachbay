import type { IncidentSnapshot, ScenarioSnapshot } from "@/lib/contracts";
import { replayRecordedExecution } from "@/hooks/execution-replay";
import type { Scenario } from "@/lib/simulation/types";
import type { ResponseModelLink, ResponseModelNode } from "./types";

export interface SavedTwinView { version: number; nodes: ResponseModelNode[]; links: ResponseModelLink[] }
export interface SavedTwinComparison { before: SavedTwinView; after: SavedTwinView; matchesRecordedAction: boolean; mismatches: string[]; parentId: string; targetId: string }

const view = (state: Scenario): SavedTwinView => ({
  version: state.version,
  nodes: state.assets.map(asset=>({id:asset.id,label:asset.name,state:asset.state,kind:asset.name.toLowerCase().includes("database") ? "DATABASE" : "Asset"})),
  links: state.edges.map(edge=>({id:edge.id,from:edge.from,to:edge.to,enabled:edge.enabled,label:edge.type})),
});

/** Uses exact immutable bytes after scope, digest, version and schema validation. Never projects current state backward. */
export async function savedTwinComparison(snapshot: IncidentSnapshot, parent: ScenarioSnapshot, target: ScenarioSnapshot, parentJson: string, targetJson: string): Promise<SavedTwinComparison> {
  const proposal=snapshot.proposals.find(proposal=>proposal.incidentId===snapshot.incident.id && proposal.id===target.proposalId);
  if(!proposal || !snapshot.scenarioHistory?.some(row=>row.id===parent.id && row.incidentId===snapshot.incident.id && row.stateDigest===parent.stateDigest) || !snapshot.scenarioHistory.some(row=>row.id===target.id && row.incidentId===snapshot.incident.id && row.stateDigest===target.stateDigest)) throw new Error("The recorded pair is unavailable in this incident.");
  const replay=await replayRecordedExecution({incidentId:snapshot.incident.id,parent,target,proposal,parentJson,targetJson});
  // replayRecordedExecution validates both full schemas and their exact metadata before parsing here.
  return {before:view(JSON.parse(parentJson) as Scenario),after:view(JSON.parse(targetJson) as Scenario),matchesRecordedAction:replay.match,mismatches:replay.mismatches,parentId:parent.id,targetId:target.id};
}
