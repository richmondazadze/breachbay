"use client";
import type { CommandError } from "@/lib/contracts";
import { authenticationRecovery } from "@/hooks/authentication-recovery";
import { LogoutControl } from "./logout-control";

export function AuthenticationRecovery({ error }: { error?: CommandError | null }) {
  const guidance = authenticationRecovery(error);
  if (!guidance || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return null;
  return (
    <div className="impact-warning">
      <p>{guidance}</p>
      <LogoutControl label="Sign out and sign in again" />
    </div>
  );
}
