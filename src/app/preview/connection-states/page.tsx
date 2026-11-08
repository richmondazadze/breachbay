import {
  ConnectionStatus,
  IncidentLoading,
} from "@/components/connection-status";
export default function StatePreview() {
  return (
    <main className="connected-main">
      <a className="text-button" href="/">
        ← Synthetic preview
      </a>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            UI STATE CATALOG · SYNTHETIC PRESENTATION ONLY
          </div>
          <h1>Connection and recovery states</h1>
          <p>
            These are component examples, not live connection or incident
            records.
          </p>
        </div>
      </div>
      <div className="state-gallery">
        <section className="panel">
          <h2>Loading</h2>
          <ConnectionStatus state="connecting" />
          <IncidentLoading />
        </section>
        <section className="panel">
          <h2>Reconnecting</h2>
          <ConnectionStatus state="reconnecting" />
          <button className="button button-primary" disabled>
            Approval unavailable while reconnecting
          </button>
        </section>
        <section className="panel">
          <h2>Error</h2>
          <ConnectionStatus state="disconnected" />
          <p className="impact-warning" role="alert">
            VERSION_CONFLICT: Scenario changed. Review the latest simulation
            before approving. Reference: synthetic-example
          </p>
        </section>
        <section className="empty-state">
          <h2>No evidence attached</h2>
          <p>
            Attach authorized evidence to begin an investigation. No findings or
            model results are available yet.
          </p>
        </section>
        <section className="panel">
          <h2>Keyboard focus</h2>
          <a className="button button-outline" href="/">
            Return to preview
          </a>
          <p>Use Tab to inspect the visible focus outline.</p>
        </section>
      </div>
    </main>
  );
}
