import { validateActiveClerkSession } from "../../../../lib/backend/oidc";
import { authFailure } from "../../../../lib/backend/http";
export const runtime = "nodejs";
/** Original Clerk JWT validation and active-session check. No incident state or credentials returned. */
export async function POST(request: Request) {
  try {
    const bearer = request.headers.get("authorization");
    if (!bearer?.startsWith("Bearer ") || bearer.length > 16016)
      return new Response(null, { status: 401 });
    return Response.json(await validateActiveClerkSession(bearer.slice(7)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return authFailure(error);
  }
}
