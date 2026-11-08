import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { scenarioReplay } from "../../src/hooks/scenario-replay";

const saved = { incidentId: "synthetic-incident", version: 3, synthetic: true, assets: [{ id: "host", state: "ISOLATED", credentialEnabled: false }], edges: [{ id: "route", enabled: false }], privateUnrecognizedField: "must not render" };
const digest = (json: string) => createHash("sha256").update(json).digest("hex");
test("replay requires a matching digest and returns only saved mutable projection", async () => {
  const json = JSON.stringify(saved);
  assert.deepEqual(await scenarioReplay(json, saved.incidentId, digest(json)), { version: 3, assets: saved.assets, edges: saved.edges });
  await assert.rejects(scenarioReplay(json.replace("ISOLATED", "ACTIVE"), saved.incidentId, digest(json)), /integrity mismatch/);
  await assert.rejects(scenarioReplay(json, "foreign-incident", digest(json)), /outside this incident/);
});
test("replay rejects nonsynthetic and malformed state even with an accurate digest", async () => {
  for (const invalid of [null, { ...saved, synthetic: false }, { ...saved, version: 0 }, { ...saved, assets: [null] }, { ...saved, assets: [{ ...saved.assets[0], state: "CONTAINED" }] }, { ...saved, assets: [{ ...saved.assets[0], credentialEnabled: "false" }] }, { ...saved, edges: [{ id: "route", enabled: "false" }] }]) {
    const json = JSON.stringify(invalid);
    await assert.rejects(scenarioReplay(json, saved.incidentId, digest(json)));
  }
});
