import { AuthError } from '../backend/clerk-token';
/** Preserve the backend boundary's authentication failures in HTTP responses. */
export function authFailure(cause: unknown) {
  if (!(cause instanceof AuthError)) return undefined;
  return { code: cause.code, message: cause.message, status: cause.code === 'UNAUTHENTICATED' ? 401 : cause.code === 'FORBIDDEN' ? 403 : 503 };
}
export function canonicalInvestigationResult<T extends { runId: string }>(result: T, canonicalRunId: string) {
  return { ...result, id: canonicalRunId, runId: canonicalRunId };
}

/** Completed command retries return historical state before any inference or writes. */
export async function recoverOrInvestigate<T>(recovered: T | undefined, start: () => Promise<T>): Promise<T> {
  if (recovered !== undefined) return recovered;
  return start();
}
