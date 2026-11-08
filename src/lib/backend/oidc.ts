/** Dedicated BreachBay Clerk identity. Clerk establishes identity; Spacetime grants incident access. */
import "server-only";
import { auth, clerkClient } from "@clerk/nextjs/server";
import {
  authConfig,
  verifyIdToken,
  authenticatedAt,
  AuthError,
} from "./clerk-token";
export {
  authConfig,
  verifyIdToken,
  authenticatedAt,
  AuthError,
  enforceOrigin,
} from "./clerk-token";
export async function sessionCredentials(request: Request) {
  const authorization = request.headers.get("authorization");
  let token: string | null | undefined;
  if (authorization) {
    if (!authorization.startsWith("Bearer ") || authorization.length > 16016)
      throw new AuthError("UNAUTHENTICATED", "Invalid bearer credential");
    token = authorization.slice(7);
  } else {
    const context = await auth();
    if (!context.userId)
      throw new AuthError("UNAUTHENTICATED", "Sign in required");
    token = await context.getToken({
      template: process.env.CLERK_JWT_TEMPLATE,
    });
  }
  if (!token)
    throw new AuthError("UNAUTHENTICATED", "Clerk session token required");
  const claims = await verifyIdToken(token);
  return {
    idToken: token,
    claims,
    expiresAt: new Date(Number(claims.exp) * 1000).toISOString(),
  };
}
export async function validateActiveClerkSession(token: string) {
  const claims = await verifyIdToken(token);
  if (!process.env.CLERK_SECRET_KEY)
    throw new AuthError(
      "DEPENDENCY_UNAVAILABLE",
      "Clerk server verification is not configured",
    );
  const client = await clerkClient();
  const session = await client.sessions.getSession(String(claims.sid));
  if (session.status !== "active" || session.userId !== claims.sub)
    throw new AuthError("UNAUTHENTICATED", "Clerk session is revoked");
  return {
    issuer: String(claims.iss),
    subject: String(claims.sub),
    audience: authConfig().audience,
    sessionId: String(claims.sid),
    expiresAt: Number(claims.exp),
    originalIssuedAt: Number(claims.iat),
    authenticatedAt: authenticatedAt(claims),
  };
}
