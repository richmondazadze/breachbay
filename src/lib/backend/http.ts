import { AuthError } from "./oidc";
import { randomUUID } from "node:crypto";
export function authFailure(error: unknown) {
  const known = error instanceof AuthError;
  const code = known ? error.code : "UNAUTHENTICATED";
  return Response.json(
    {
      ok: false,
      error: {
        code,
        message: known ? error.message : "Authentication failed",
        retryable: code === "DEPENDENCY_UNAVAILABLE",
      },
      correlationId: randomUUID(),
    },
    {
      status:
        code === "FORBIDDEN"
          ? 403
          : code === "DEPENDENCY_UNAVAILABLE"
            ? 503
            : 401,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
