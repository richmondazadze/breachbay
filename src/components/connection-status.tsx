import type { ConnectionState } from "@/hooks/use-incident";
const descriptions = {
  connecting:
    "Connecting securely. Incident data is not available yet.",
  live: "Incident data is up to date with the server.",
  reconnecting:
    "Connection interrupted. Displayed state may be stale; commands are disabled.",
  disconnected: "The secure connection is unavailable. Commands are disabled.",
};
export function ConnectionStatus({ state }: { state: ConnectionState }) {
  return (
    <div className="connection-strip" data-state={state} role="status">
      <span className="connection-marker" aria-hidden="true" />
      <div>
        <strong>
          {state === "live"
            ? "Live connection"
            : state === "connecting"
              ? "Connecting"
              : state === "reconnecting"
                ? "Reconnecting"
                : "Disconnected"}
        </strong>
        <p>{descriptions[state]}</p>
      </div>
      {state === "disconnected" && (
        <a className="text-button" href="/sign-in">
          Sign in again →
        </a>
      )}
    </div>
  );
}
export function IncidentLoading() {
  return (
    <div
      className="loading-skeleton"
      role="status"
      aria-label="Loading authorized incident state"
    >
      <span>Loading authorized incident state…</span>
      <div className="skeleton-line" aria-hidden="true" />
      <div className="skeleton-line short" aria-hidden="true" />
    </div>
  );
}
