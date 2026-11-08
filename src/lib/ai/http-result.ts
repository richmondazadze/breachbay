import { backendBoundaryFailure } from '../backend/command-error';
import { AIError } from './nemotron';
import type { ErrorCode } from '../contracts';
const failureStatuses: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401, FORBIDDEN: 403, INCIDENT_NOT_FOUND: 404, NOT_FOUND: 404,
  INVALID_INPUT: 400, INVALID_TRANSITION: 409, VERSION_CONFLICT: 409, IDEMPOTENCY_CONFLICT: 409,
  EVIDENCE_REDACTED: 403, INVALID_MODEL_OUTPUT: 422, SIMULATION_FAILED: 422,
  APPROVAL_EXPIRED: 409, RATE_LIMITED: 429, MODEL_UNAVAILABLE: 503, DEPENDENCY_UNAVAILABLE: 503,
};
/** Canonical backend denials retain their code and recovery message through the AI route. */
export function aiFailure(cause: unknown) {
  if (!(cause instanceof AIError)) return undefined;
  return { code: cause.code, message: cause.message, status: failureStatuses[cause.code] };
}
/** BackendCommandError has AuthError ancestry: preserve canonical denials through the real route. */
export const authFailure = backendBoundaryFailure;
/** The route consumes this exact composed boundary; untyped failures expose no implementation text. */
export function investigationFailure(cause: unknown) {
  return authFailure(cause) ?? aiFailure(cause) ?? { code: 'DEPENDENCY_UNAVAILABLE' as const, message: 'Investigation backend request failed', status: 503 };
}
export function canonicalInvestigationResult<T extends { runId: string }>(result: T, canonicalRunId: string) {
  return { ...result, id: canonicalRunId, runId: canonicalRunId };
}

/** Completed command retries return historical state before any inference or writes. */
export async function recoverOrInvestigate<T>(recovered: T | undefined, start: () => Promise<T>): Promise<T> {
  if (recovered !== undefined) return recovered;
  return start();
}
