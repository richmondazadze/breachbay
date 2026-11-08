import { randomUUID } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { authenticatedBackend } from "../../../../lib/backend/server";
import { enforceOrigin } from "../../../../lib/backend/oidc";
import { authFailure } from "../../../../lib/backend/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    enforceOrigin(request);
    const { conn, credentials } = await authenticatedBackend(request);
    try {
      await conn.reducers.logout({
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
      });
      await (
        await clerkClient()
      ).sessions.revokeSession(String(credentials.claims.sid));
    } finally {
      conn.disconnect();
    }
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return authFailure(error);
  }
}
