import { reverificationErrorResponse } from "@clerk/nextjs/server";
import { AuthError, enforceOrigin, sessionCredentials, validateActiveClerkSession } from "@/lib/backend/oidc";
import { authFailure } from "@/lib/backend/http";
import { recentlyVerified } from "@/lib/backend/reverification";

export const runtime = "nodejs";

/** Identity freshness only: no incident read, permission change, action retry or execution. */
export async function POST(request: Request) {
  try {
    enforceOrigin(request);
    const { idToken } = await sessionCredentials(request);
    const session = await validateActiveClerkSession(idToken);
    if (session.subject === process.env.AI_SERVICE_CLERK_USER_ID) {
      throw new AuthError("FORBIDDEN", "Human verification required");
    }
    if (!recentlyVerified(session.authenticatedAt, Date.now() / 1000)) {
      const response = reverificationErrorResponse({ level: "first_factor", afterMinutes: 14 });
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    return Response.json({ verified: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return authFailure(error);
  }
}
