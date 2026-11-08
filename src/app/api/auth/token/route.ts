/** Browser token retrieval is owned by Clerk useAuth().getToken(), without a parallel cookie session. */
export async function GET() {
  return Response.json(
    {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "Use the dedicated Clerk session token provider",
        retryable: false,
      },
    },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
