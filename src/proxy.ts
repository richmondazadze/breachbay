import { transportCspOrigins, removeInlineScriptFallback } from "./components/auth/csp-policy";
import { normalizeClerkContinuation } from "./components/auth/normalize-clerk-response";
import { clerkMiddleware } from "@clerk/nextjs/server";
import {
  NextResponse,
  type NextRequest,
  type NextFetchEvent,
} from "next/server";
const clerk = clerkMiddleware({
  contentSecurityPolicy: {
    strict: true,
    directives: {
      "connect-src": transportCspOrigins(process.env.NEXT_PUBLIC_SPACETIMEDB_ENDPOINT),
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "frame-ancestors": ["'none'"],
      "script-src-attr": ["'none'"],
      "font-src": ["'self'"],
      "img-src": ["data:", "blob:"],
    },
  },
});
// Missing configuration leaves only the explicitly unconnected UI available.
// Backend owns authentication/authorization and must reject unconfigured access.
export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  if (
    !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    !process.env.CLERK_SECRET_KEY
  )
    return NextResponse.next();
  const response = await clerk(request, event);
  return response ? normalizeClerkContinuation(request.url, removeInlineScriptFallback(response)) : response;
}
export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
