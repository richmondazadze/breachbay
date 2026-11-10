import type { OperationalResponse } from "@/lib/response/contract";
import { recordedApplicationEffect } from "@/hooks/application-effect-presentation";

export function RecordedApplicationEffect({ response }: { response: OperationalResponse }) {
  if (!response.resultJson) return null;
  const effect = recordedApplicationEffect(response);
  if (!effect) return <p className="small muted">Recorded checks are unavailable for this response.</p>;
  return <section className="bb-application-effect" aria-label="Recorded application checks">
    <header><strong>Recorded application checks</strong><time dateTime={effect.observedAt}>{new Date(effect.observedAt).toLocaleString()}</time></header>
    <dl>
      <div><dt>Application login</dt><dd>{effect.loginEnabled === null ? "Unconfirmed" : effect.loginEnabled ? "Enabled" : "Disabled"}<small>{effect.observedVersion === null ? "No matching state observation" : `Observed version ${effect.observedVersion}`}</small></dd></div>
      <div><dt>New login check</dt><dd>{effect.loginCode === 200 ? "Allowed" : effect.loginCode === 403 ? "Denied" : "Unconfirmed"}<small>{effect.loginCode === null ? "No HTTP response recorded" : `HTTP ${effect.loginCode}`}</small></dd></div>
      <div><dt>Health check</dt><dd>{effect.healthCode === 200 ? "Available" : "Unconfirmed"}<small>{effect.healthCode === null ? "No HTTP response recorded" : `HTTP ${effect.healthCode}`}</small></dd></div>
    </dl>
    {effect.receiptVersions && <p className="bb-effect-version">Application receipt <span>v{effect.receiptVersions.before} <span aria-label="to">→</span> v{effect.receiptVersions.after}</span></p>}
    <p className="small muted">{effect.differentInstance ? "The observed application instance differs from this response's target. " : ""}These checks describe the recorded time. Read a fresh application preview for its current state.</p>
  </section>;
}
