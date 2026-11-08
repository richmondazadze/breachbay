import { AuthError } from "./clerk-token";
import { ERROR_CODES, type CommandResult, type ErrorCode } from "../contracts";
import { backendError } from "./client";

const messages: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Backend authentication is expired or requires recent verification",
  FORBIDDEN: "Incident permission denied",
  INCIDENT_NOT_FOUND: "Incident unavailable",
  INVALID_INPUT: "Backend command input rejected",
  INVALID_TRANSITION: "Current incident or action state does not permit this command",
  VERSION_CONFLICT: "State changed; refresh before retrying",
  EVIDENCE_REDACTED: "Evidence is unavailable under the current policy",
  INVALID_MODEL_OUTPUT: "Model output failed backend validation",
  MODEL_UNAVAILABLE: "Model provider unavailable",
  SIMULATION_FAILED: "Synthetic response simulation failed",
  APPROVAL_EXPIRED: "Approval expired; human review is required",
  RATE_LIMITED: "Backend command rate limit exceeded",
  DEPENDENCY_UNAVAILABLE: "Backend command did not return a confirmed result",
  NOT_FOUND: "Requested incident record unavailable",
  IDEMPOTENCY_CONFLICT: "Command key was already used with different input",
};
/** AuthError ancestry makes the AI orchestration abort without correction, fallback or further writes. */
export class BackendCommandError extends AuthError {
  constructor(code: ErrorCode) { super(code, messages[code]); }
}
export function canonicalBackendCommandError(cause: unknown): BackendCommandError {
  if (cause instanceof BackendCommandError) return cause;
  const code = cause && typeof cause === "object" && "code" in cause && (ERROR_CODES as readonly unknown[]).includes(cause.code)
    ? cause.code as ErrorCode : backendError(cause).code;
  return new BackendCommandError(code);
}
export function committedCommandData<T>(result: CommandResult<T>): T {
  if (!result.ok) throw canonicalBackendCommandError(result.error);
  return result.data;
}
/** AI HTTP owner consumes this mapping; no reducer/provider message or payload is exposed. */
export function backendBoundaryFailure(cause: unknown) {
  if (!(cause instanceof AuthError)) return undefined;
  const error = canonicalBackendCommandError(cause);
  const status = error.code === "UNAUTHENTICATED" ? 401 : ["FORBIDDEN", "EVIDENCE_REDACTED"].includes(error.code) ? 403 : ["NOT_FOUND", "INCIDENT_NOT_FOUND"].includes(error.code) ? 404 : ["VERSION_CONFLICT", "INVALID_TRANSITION", "IDEMPOTENCY_CONFLICT", "APPROVAL_EXPIRED"].includes(error.code) ? 409 : error.code === "INVALID_INPUT" ? 400 : error.code === "INVALID_MODEL_OUTPUT" ? 422 : error.code === "RATE_LIMITED" ? 429 : 503;
  return { code: error.code, message: error.message, status };
}
