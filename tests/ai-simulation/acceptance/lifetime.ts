/** Unverified claim parsing is scheduling preflight only; deployed backend verifies the JWT. */
export class AcceptanceLifetimeError extends Error {}
const SAFETY_MS = 5000;
export function originalTokenWindow(token: string, origin: string, now = Date.now()) {
  let claims: { exp?: unknown; azp?: unknown; sid?: unknown };
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error();
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch { throw new AcceptanceLifetimeError('Original browser session JWT is malformed; supply a fresh browser token'); }
  if (!claims || typeof claims.exp !== 'number' || !Number.isSafeInteger(claims.exp) || typeof claims.sid !== 'string' || !claims.sid || claims.azp !== origin) throw new AcceptanceLifetimeError('Preflight requires original browser session claims with genuine matching azp, sid and exp; backend still verifies identity');
  const expiresAt = claims.exp * 1000;
  if (expiresAt - now <= 45000) throw new AcceptanceLifetimeError('Original browser token has 45 seconds or less remaining; supply a fresh token for a bounded live attempt');
  const deadline = expiresAt - SAFETY_MS;
  return {
    expiresAt, deadline,
    remaining(at = Date.now()) {
      const left = Math.floor(deadline - at);
      if (left <= 0) throw new AcceptanceLifetimeError('Original token acceptance window exhausted; stopped before expiry without renewal');
      return left;
    },
    signal(capMs: number, at = Date.now()) {
      const left = Math.floor(deadline - at);
      if (left <= 0) throw new AcceptanceLifetimeError('Original token acceptance window exhausted; no further requests allowed');
      return AbortSignal.timeout(Math.min(capMs, left));
    },
  };
}
