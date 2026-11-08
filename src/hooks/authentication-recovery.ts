import type { CommandError } from "@/lib/contracts";

export function authenticationRecovery(error?: Pick<CommandError, "code" | "message"> | null) {
  if (error?.code !== "UNAUTHENTICATED") return null;
  return /recent authentication/i.test(error.message)
    ? "This action requires a recent sign-in. Sign out and sign in again, then review the current server state before retrying."
    : "Sign out and sign in again to restore your authenticated session. Review the current server state before retrying.";
}
