import "server-only";
import type { BackendSession } from "../contracts";
import { connectBackend } from "./client";
import { sessionCredentials, authenticatedAt, AuthError } from "./oidc";
export function backendConfig() {
  const endpoint =
    process.env.SPACETIMEDB_ENDPOINT ??
    process.env.NEXT_PUBLIC_SPACETIMEDB_ENDPOINT;
  const database =
    process.env.SPACETIMEDB_DATABASE ??
    process.env.NEXT_PUBLIC_SPACETIMEDB_DATABASE;
  if (!endpoint || !database)
    throw new AuthError(
      "DEPENDENCY_UNAVAILABLE",
      "Spacetime backend is not configured",
    );
  return { endpoint, database };
}
export async function authenticatedBackend(request: Request) {
  const credentials = await sessionCredentials(request);
  const conn = await connectBackend({
    ...backendConfig(),
    token: credentials.idToken,
  });
  const profile = [...conn.db.myProfile.iter()][0];
  if (!profile) {
    conn.disconnect();
    throw new AuthError("UNAUTHENTICATED", "Inactive backend session");
  }
  const session: BackendSession = {
    user: { ...profile, status: profile.status as "ACTIVE" | "DISABLED" },
    expiresAt: credentials.expiresAt,
    authenticatedAt: new Date(
      authenticatedAt(credentials.claims) * 1000,
    ).toISOString(),
  };
  return { conn, session, credentials };
}
