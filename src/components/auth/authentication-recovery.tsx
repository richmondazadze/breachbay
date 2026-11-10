"use client";
import { useAuth, useReverification } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import type { CommandError } from "@/lib/contracts";
import { authenticationRecovery } from "@/hooks/authentication-recovery";
import { LogoutControl } from "./logout-control";
import { Button } from "../ui/button";

export function AuthenticationRecovery({ error }: { error?: CommandError | null }) {
  const guidance = authenticationRecovery(error);
  if (!guidance || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return null;
  if (/recent authentication/i.test(error?.message ?? "")) return <VerifyCurrentSession />;
  return (
    <div className="impact-warning">
      <p>{guidance}</p>
      <LogoutControl label="Sign out and sign in again" />
    </div>
  );
}

function VerifyCurrentSession() {
  const { getToken, sessionId } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const currentSession = useRef(sessionId);
  const active = useRef(true);
  const busy = useRef(false);
  currentSession.current = sessionId;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const verify = useReverification(async () => {
    const token = await getToken({ skipCache: true, ...(process.env.NEXT_PUBLIC_CLERK_JWT_TEMPLATE ? { template: process.env.NEXT_PUBLIC_CLERK_JWT_TEMPLATE } : {}) });
    if (!token) throw new Error("SESSION_UNAVAILABLE");
    const response = await fetch("/api/auth/reverify", {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
      credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    // Clerk retries this freshness check after its modal, never the rejected command.
    return response.json();
  });
  async function reverify() {
    if (busy.current) return;
    busy.current = true;
    const startedSession = sessionId;
    setPending(true); setError("");
    try {
      const result = await verify();
      if (!active.current || currentSession.current !== startedSession) return;
      if (result?.verified !== true) throw new Error("VERIFICATION_UNCONFIRMED");
      // Reconnect with a freshly verified JWT and re-read authoritative state. No mutation is retried.
      window.location.reload();
    } catch {
      if (active.current && currentSession.current === startedSession) setError("Verification was not completed. Try again, or sign out and sign in. Your decision has not been retried.");
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  }
  return <div className="impact-warning">
    <p>This action requires recent identity verification. Verify your current session, then review the refreshed workspace before retrying your decision.</p>
    <Button size="sm" disabled={pending} onClick={() => void reverify()}>{pending ? "Verifying identity…" : "Verify identity"}</Button>
    {error && <p role="alert">{error}</p>}
    <details><summary>Use sign-in instead</summary><LogoutControl label="Sign out and sign in again" /></details>
  </div>;
}
