/** Pure verification of dedicated Clerk session JWTs; issuer/origin are public configuration. */
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { ErrorCode } from "../contracts";
export class AuthError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}
export function authConfig() {
  const issuer = process.env.CLERK_ISSUER_URL ?? process.env.OIDC_ISSUER;
  const audience = process.env.OIDC_AUDIENCE ?? "breachbay.us";
  const origin = process.env.APP_ORIGIN ?? "https://breachbay.us";
  if (!issuer)
    throw new AuthError(
      "DEPENDENCY_UNAVAILABLE",
      "Dedicated Clerk issuer is not configured",
    );
  const issuerURL = new URL(issuer),
    originURL = new URL(origin);
  const local = (url: URL) =>
    process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
    url.protocol === "http:";
  if (
    (issuerURL.protocol !== "https:" && !local(issuerURL)) ||
    (originURL.protocol !== "https:" && !local(originURL)) ||
    issuerURL.username ||
    issuerURL.password ||
    originURL.pathname !== "/"
  )
    throw new AuthError(
      "DEPENDENCY_UNAVAILABLE",
      "Trusted Clerk issuer and application origin require TLS",
    );
  return {
    issuer,
    audience,
    origin: originURL.origin,
    jwksUri: `${issuer.replace(/\/$/, "")}/.well-known/jwks.json`,
  };
}
const keys = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export async function verifyIdToken(token: string) {
  const config = authConfig();
  let jwks = keys.get(config.jwksUri);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(config.jwksUri));
    keys.set(config.jwksUri, jwks);
  }
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ["RS256", "ES256"],
      clockTolerance: 0,
      requiredClaims: ["sub", "sid", "exp", "iat"],
    });
    if (
      typeof payload.sid !== "string" ||
      typeof payload.sub !== "string" ||
      typeof payload.iat !== "number" ||
      payload.iat > Date.now() / 1000 + 5 ||
      (payload.azp !== config.origin &&
        !(
          process.env.AI_SERVICE_CLERK_USER_ID === payload.sub &&
          payload.azp === undefined
        ))
    )
      throw new AuthError(
        "UNAUTHENTICATED",
        "Clerk session origin or claims invalid",
      );
    return payload;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError("UNAUTHENTICATED", "Clerk token is invalid or expired");
  }
}
export function authenticatedAt(claims: { iat?: number; fva?: unknown }) {
  const age = Array.isArray(claims.fva) ? claims.fva[0] : undefined;
  return typeof age === "number" &&
    Number.isFinite(age) &&
    age >= 0 &&
    typeof claims.iat === "number"
    ? claims.iat - (age + 1) * 60
    : 0;
}
export function enforceOrigin(request: Request) {
  if (request.headers.get("origin") !== authConfig().origin)
    throw new AuthError("FORBIDDEN", "Same-origin request required");
}
