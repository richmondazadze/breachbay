// Harmless operator-only JSON capability probe. No incident data or model text is printed.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
async function main() {
  const imported = await import(pathToFileURL(join(process.cwd(), 'src/lib/ai/nemotron.ts')).href);
  const {callNemotron} = imported.default ?? imported;
  const result = await callNemotron([
    {role: 'system', content: 'Return a single JSON object with status READY. No explanation.'},
    {role: 'user', content: 'Report JSON readiness as {"status":"READY"}.'},
  ], [], AbortSignal.timeout(30000), 'final_json');
  assert.equal(result.model, process.env.NEMOTRON_MODEL);
  assert.ok(!result.reply.tool_calls?.length);
  assert.deepEqual(JSON.parse(result.reply.content), {status: 'READY'});
  console.log('PASS: real NVIDIA tool-free JSON capability; latencyMs=' + result.latencyMs + '. Incident investigation remains unverified.');
}
main().catch(() => {
  console.error('FAIL: structured provider capability; no provider body or credential output');
  process.exitCode = 1;
});
