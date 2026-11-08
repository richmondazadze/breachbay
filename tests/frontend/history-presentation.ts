import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScenarioComparison } from "../../src/components/scenario-history";
import { ResponsePlanning } from "../../src/components/response-planning";
import type { IncidentSnapshot } from "../../src/lib/contracts";

// Explicitly synthetic, only the fields used by the shared scoped projection.
const snapshot = {
  incident: { id: "synthetic", classification: "SYNTHETIC", scenarioVersion: 4, scenarioId: "test" },
  assets: [{ id: "host", incidentId: "synthetic", name: "Test host", criticality: "HIGH", state: "COMPROMISED", riskLabels: ["CREDENTIAL_DISABLED"] }],
  edges: [{ id: "route", incidentId: "synthetic", fromId: "host", toId: "host", type: "COMMUNICATES_WITH", enabled: false, verificationStatus: "VERIFIED", sourceEvidenceIds: [] }],
} as unknown as IncidentSnapshot;
test("history compares authorized isolation/credential/link projections without claiming health", () => {
  const html = renderToStaticMarkup(createElement(ScenarioComparison, { snapshot, replay: { version: 3, assets: [{ id: "host", state: "ISOLATED", credentialEnabled: true }], edges: [{ id: "route", enabled: true }] } }));
  assert.match(html, /Saved v3 compared with current v4/);
  assert.match(html, /Consult live asset status for compromise and service health/);
  assert.match(html, /<td>ISOLATED<\/td><td>ACTIVE<\/td><td>Enabled<\/td><td>Disabled<\/td>/);
  assert.match(html, /<td>Enabled<\/td><td>Disabled<\/td>/);
  assert.doesNotMatch(html, /HEALTHY|contained successfully/i);
});
test("foreign comparison fails closed and historical records get no invented plan", () => {
  const html = renderToStaticMarkup(createElement(ScenarioComparison, { snapshot: { ...snapshot, assets: [{ ...snapshot.assets[0], incidentId: "foreign" }] }, replay: { version: 3, assets: [], edges: [] } }));
  assert.match(html, /unavailable for comparison/);
  assert.doesNotMatch(html, /Test host/);
  assert.equal(renderToStaticMarkup(createElement(ResponsePlanning, { assets: snapshot.assets })), "");
});
