"use client";
import { useAuth, useClerk } from "@clerk/nextjs";
import { useState } from "react";
import { Button } from "../ui/button";
export function LogoutControl({ label = "Sign out" }: { label?: string }) {
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    if (pending) return;
    setPending(true);
    setError("");
    window.dispatchEvent(new Event("breachbay-session-ending"));
    try {
      const token = await getToken({
        skipCache: true,
        ...(process.env.NEXT_PUBLIC_CLERK_JWT_TEMPLATE
          ? { template: process.env.NEXT_PUBLIC_CLERK_JWT_TEMPLATE }
          : {}),
      });
      if (!token) {
        await signOut({ redirectUrl: "/sign-in" });
        return;
      }
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok || !body.ok)
        throw new Error(
          "Server session revocation was not confirmed. Retry sign out.",
        );
      await signOut({ redirectUrl: "/sign-in" });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Sign out failed. Retry to revoke your server session.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="logout-control">
      <Button variant="outline" size="sm" disabled={pending} onClick={logout}>
        {pending ? "Signing out…" : label}
      </Button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
