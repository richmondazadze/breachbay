import { authenticatedBackend } from "../../../../lib/backend/server";
import { authFailure } from "../../../../lib/backend/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const { conn, session } = await authenticatedBackend(request);
    conn.disconnect();
    return Response.json(
      { ok: true, data: session },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return authFailure(error);
  }
}
