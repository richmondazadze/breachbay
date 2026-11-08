import { LIGHTNING_MODEL } from './provider-profile';

/** Shared final contract; native JSON mode still passes every existing validator. */
export const FINAL_RESPONSE_CONTRACT = '{"findings":[{"summary":"...","confidence":"LOW|MEDIUM|HIGH","evidenceIds":["existing ID"],"unknowns":[],"recommendedNextQueries":["bounded follow-up query"]}],"planning":{"assumptions":[],"uncertainty":[],"alternatives":[{"action":{"type":"ISOLATE_SIMULATED_HOST|BLOCK_SIMULATED_ROUTE|RESET_SIMULATED_CREDENTIAL","targetIds":["existing asset ID for host/credential action or communication edge ID for route action"]},"rationale":"...","tradeoffs":["..."]}]},"proposal":{"type":"ISOLATE_SIMULATED_HOST|BLOCK_SIMULATED_ROUTE|RESET_SIMULATED_CREDENTIAL","targetIds":["existing asset ID for host/credential action or communication edge ID for route action"]}|null}';
export const PROPOSAL_DRAFT_GUIDANCE = 'A proposal is a permitted synthetic response draft for human review, simulation and approval; returning a draft does not approve or execute containment. When retrieved evidence supports a scoped response, first choose the proposal action type, then include a supported planning alternative with a DIFFERENT ACTION TYPE. Changing only target IDs does not satisfy this model-generation contract. Preview both independently from the same current scenario. Use proposal:null only when the retrieved evidence is insufficient to support a response; never invent evidence or targets to fill a proposal or alternative.';

export type FinalizationCorrectionReason = 'FINAL_JSON_INVALID' | 'PLAN_FIELDS_INVALID' | 'PLAN_REQUIRED' | 'PLAN_DISTINCT_ALTERNATIVE_REQUIRED';
/** Allowlisted JSON/planning failures share one native finalization after the three-tool gate. */
export function mayCorrectFinalization(model: string, step: number, correctionCount: number) {
  return model === LIGHTNING_MODEL && correctionCount === 0 && step >= 0 && step < 7;
}
