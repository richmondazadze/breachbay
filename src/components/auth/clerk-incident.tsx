"use client";
import { LogoutControl } from "./logout-control";
import { useAuth } from "@clerk/nextjs";
import { useMemo, useCallback } from "react";
import { ApplicationFrame } from "../application-frame";
import { ConnectedIncident } from "../connected-incident";
import { createClerkIncidentClient } from "@/hooks/clerk-incident-client";
export function ClerkIncident({ incidentId }: { incidentId: string }) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)
    return <ConnectedIncident incidentId={incidentId} />;
  return <AuthenticatedIncident incidentId={incidentId} />;
}
function AuthenticatedIncident({ incidentId }: { incidentId: string }) {
  const { isLoaded, isSignedIn, getToken, userId, sessionId } = useAuth();
  const tokenSource = useCallback(
    () =>
      getToken({
        skipCache: true,
        ...(process.env.NEXT_PUBLIC_CLERK_JWT_TEMPLATE
          ? { template: process.env.NEXT_PUBLIC_CLERK_JWT_TEMPLATE }
          : {}),
      }),
    [getToken],
  );
  const client = useMemo(
    () => (isSignedIn ? createClerkIncidentClient(tokenSource) : undefined),
    [isSignedIn, userId, sessionId, tokenSource],
  );
  if (!isLoaded)
    return (
      <ApplicationFrame title="Incident workspace"><p role="status">Loading responder session…</p></ApplicationFrame>
    );
  if (!isSignedIn)
    return (
      <ApplicationFrame title="Incident workspace">
        <h1>Sign in to join this incident</h1>
        <p>Incident permissions are checked after authentication.</p>
        <a className="button button-primary" href="/sign-in">
          Responder sign in
        </a>
      </ApplicationFrame>
    );
  return (
      <ConnectedIncident
        key={sessionId}
        incidentId={incidentId}
        client={client}
        accountControls={<LogoutControl />}
      />
  );
}
