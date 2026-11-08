"use client";
import { useAuth } from "@clerk/nextjs";
import { useCallback, useMemo } from "react";
import { createClerkIncidentClient } from "@/hooks/clerk-incident-client";
import { ExecutionAcceptance } from "../execution-acceptance";
import { LogoutControl } from "./logout-control";

export function ClerkAcceptance({ incidentId }: { incidentId: string }) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return <ExecutionAcceptance incidentId={incidentId} />;
  return <AuthenticatedAcceptance incidentId={incidentId} />;
}
function AuthenticatedAcceptance({ incidentId }: { incidentId: string }) {
  const { isLoaded, isSignedIn, userId, sessionId, getToken } = useAuth();
  // Same token handoff as the normal incident wrapper; no extraction, parsing,
  // persistence or display of tokens in the acceptance page.
  const tokenSource = useCallback(() => getToken({ skipCache: true, ...(process.env.NEXT_PUBLIC_CLERK_JWT_TEMPLATE ? { template: process.env.NEXT_PUBLIC_CLERK_JWT_TEMPLATE } : {}) }), [getToken]);
  const client = useMemo(() => isSignedIn ? createClerkIncidentClient(tokenSource) : undefined, [isSignedIn, userId, sessionId, tokenSource]);
  if (!isLoaded) return <main className="connected-main" role="status">Loading responder session…</main>;
  if (!isSignedIn) return <main className="connected-main"><h1>Sign in for browser acceptance</h1><p>A normal human commander session and scoped incident permission are required.</p><a className="button button-primary" href="/sign-in">Responder sign in</a></main>;
  return <><div className="identity-toolbar"><span>Dedicated BreachBay account</span><LogoutControl /></div><ExecutionAcceptance key={sessionId} incidentId={incidentId} client={client} /></>;
}
