/** Clerk 7 rewrites its NextResponse.next to the unchanged request URL so it can
 * forward signed authentication headers. Behind TLS termination that URL can
 * contain https://localhost even though the upstream listener is plaintext.
 * Restore continuation only for the exact original resource, leaving all
 * request-header overrides, cookies, redirects and real rewrites untouched. */
export function normalizeClerkContinuation(requestUrl: string, response: Response): Response {
  if (response.headers.get("x-middleware-rewrite") === requestUrl &&
      !response.headers.has("location") && !response.headers.has("x-nextjs-redirect")) {
    response.headers.delete("x-middleware-rewrite");
    response.headers.set("x-middleware-next", "1");
  }
  return response;
}
