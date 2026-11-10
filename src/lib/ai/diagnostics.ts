/** Fixed diagnostic vocabulary only; never derive public reasons from provider/evidence text. */
export type FailureStage = 'PROVIDER' | 'TOOLS' | 'FINAL_JSON' | 'FINDINGS' | 'PLANNING' | 'PROPOSAL' | 'PERSISTENCE' | 'BUDGET';
export type FailureReason = 'PROVIDER_TIMEOUT' | 'PROVIDER_CANCELLED' | 'PROVIDER_CONNECTION_FAILED' | 'PROVIDER_TRUNCATED' | 'PROVIDER_JSON_INVALID' | 'PROVIDER_SCHEMA_INVALID' | 'PROVIDER_TOO_LARGE' | 'PROVIDER_FINAL_TOOL_CALLS' | 'FINAL_JSON_INVALID' | 'FINAL_ROOT_INVALID' | 'FINAL_SCHEMA_INVALID' | 'FINDINGS_SHAPE_INVALID' | 'FINDING_FIELDS_INVALID' | 'CITATION_NOT_RETRIEVED' | 'NEXT_QUERIES_INVALID' | 'NEXT_QUERIES_MISSING' | 'NO_FINDINGS' | 'PLAN_FIELDS_INVALID' | 'PLAN_ALTERNATIVE_INVALID' | 'PLAN_REQUIRED' | 'PLAN_DISTINCT_ALTERNATIVE_REQUIRED' | 'VALIDATION_REJECTED';
export interface FailureDiagnostic { stage: FailureStage; reason: FailureReason }
export class OutputValidationError extends Error {
  constructor(public diagnostic: FailureDiagnostic) { super('INVALID_MODEL_OUTPUT'); }
}
