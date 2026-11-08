import type { Proposal, ScenarioSnapshot } from "@/lib/contracts";
import { simulateResponse, validateScenario, verifyExecution } from "@/lib/simulation/engine";
import type { Preview, Scenario } from "@/lib/simulation/types";

export function executionReplayUnavailable(target: ScenarioSnapshot, history: ScenarioSnapshot[], proposals: Proposal[]): string | undefined {
  if (target.operation !== "EXECUTION") return "This record supports snapshot inspection. No execution operation is recorded for replay.";
  if (target.parentVersion === undefined || target.scenarioVersion !== target.parentVersion + 1) return "The exact recorded parent version is unavailable or invalid.";
  if (!history.some(row => row.incidentId === target.incidentId && row.scenarioVersion === target.parentVersion)) return "The recorded parent snapshot is unavailable in this scope.";
  const proposal = proposals.find(row => row.id === target.proposalId && row.incidentId === target.incidentId);
  if (!proposal || proposal.expectedVersion !== target.parentVersion) return "The historical action bound to this parent version is unavailable.";
  return undefined;
}
const hasOnly = (value: unknown, keys: string[]) => !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
async function readReplayState(json: string, metadata: ScenarioSnapshot, incidentId: string): Promise<Scenario> {
  if (metadata.incidentId !== incidentId || json.length > 500000 || !/^[\da-f]{64}$/i.test(metadata.stateDigest)) throw new Error("Saved replay integrity or scope is unavailable.");
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(json));
  const digest = [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join("");
  if (digest !== metadata.stateDigest.toLowerCase()) throw new Error("Saved replay snapshot integrity mismatch.");
  let state: Scenario;
  try { state = JSON.parse(json) as Scenario; }
  catch { throw new Error("Saved replay snapshot JSON is invalid."); }
  if (!hasOnly(state, ["incidentId", "version", "seed", "synthetic", "assets", "edges", "compromisedAssetIds", "protectedAssetIds"]) || state.incidentId !== incidentId || state.version !== metadata.scenarioVersion || typeof state.seed !== "string" || !Array.isArray(state.assets) || !Array.isArray(state.edges) || state.assets.length > 1000 || state.edges.length > 5000) throw new Error("Invalid saved replay schema, scope or version.");
  if (state.assets.some(asset => !hasOnly(asset, ["id", "name", "criticality", "state", "credentialEnabled"])) || state.edges.some(edge => !hasOnly(edge, ["id", "from", "to", "type", "enabled", "credentialId", "evidenceIds"]))) throw new Error("Invalid saved replay record schema.");
  validateScenario(state);
  return state;
}
export interface ExecutionReplayResult { match: boolean; mismatches: string[]; preview: Preview; parentSnapshotId: string; targetSnapshotId: string; proposalId: string }
/** Pure client analysis of immutable historical records; never calls a command or uses current state. */
export async function replayRecordedExecution({ incidentId, parent, target, proposal, parentJson, targetJson }: {
  incidentId: string; parent: ScenarioSnapshot; target: ScenarioSnapshot; proposal: Proposal; parentJson: string; targetJson: string;
}): Promise<ExecutionReplayResult> {
  const unavailable = executionReplayUnavailable(target, [parent], [proposal]);
  if (unavailable || target.incidentId !== incidentId || parent.incidentId !== incidentId || proposal.incidentId !== incidentId || parent.id === target.id) throw new Error(unavailable ?? "Historical replay scope mismatch.");
  const before = await readReplayState(parentJson, parent, incidentId);
  const savedTarget = await readReplayState(targetJson, target, incidentId);
  if (before.seed !== savedTarget.seed) throw new Error("Saved replay scenario definition differs.");
  const action = proposal.action;
  if (!action || !Array.isArray(action.targetIds) || action.targetIds.some(id => typeof id !== "string") || action.route && (action.type !== "BLOCK_SIMULATED_ROUTE" || action.targetIds.some(id => !before.edges.some(edge => edge.id === id && edge.from === action.route!.fromId && edge.to === action.route!.toId)))) throw new Error("Historical action is invalid for the recorded parent.");
  const preview = simulateResponse(before, action, before.version);
  const verification = verifyExecution(preview.nextState, savedTarget);
  return { match: verification.status === "VERIFIED_SUCCESS", mismatches: verification.mismatches, preview, parentSnapshotId: parent.id, targetSnapshotId: target.id, proposalId: proposal.id };
}
