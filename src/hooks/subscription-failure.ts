/** Keep a useful initial failure reference without displaying arbitrary SDK
 * error messages, connection URLs or credential arguments. */
export function subscriptionFailureMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "EvalError") return "Connection setup was blocked by the script policy. Reference CONNECTION_SCRIPT_POLICY. Reload after the application update.";
    if (error.message === "Spacetime connection is not configured.") return error.message;
    if (error.message === "Sign in again to restore your session.") return error.message;
    if (error.message === "TLS endpoint required") return "Secure connection configuration is required. Reference CONNECTION_CONFIGURATION.";
  }
  return "The database connection is unavailable. BreachBay will retry automatically. If this continues, check that the application and database services are reachable.";
}
