/** Clerk owns its login callback; retired generic OIDC endpoint. */
export async function GET() {
  return Response.json(
    {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "Sign in through the dedicated BreachBay Clerk application",
        retryable: false,
      },
    },
    { status: 410 },
  );
}
