// Operator-only provider capability probe. No incident data or credentials are printed.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';

let phase = 'production provider module';
async function main() {
  const imported = await import(pathToFileURL(join(process.cwd(), 'src/lib/ai/nemotron.ts')).href);
  const {callNemotron} = imported.default ?? imported;
  phase = 'hosted function call';
  const result = await callNemotron([
    {role: 'system', content: 'This is a provider capability check. Call report_readiness once with status READY. Do not write an explanation.'},
    {role: 'user', content: 'Report readiness using the provided function.'},
  ], [{type: 'function', function: {
    name: 'report_readiness', description: 'Report readiness for a harmless capability probe.',
    parameters: {type: 'object', properties: {status: {type: 'string', enum: ['READY']}}, required: ['status'], additionalProperties: false},
  }}], AbortSignal.timeout(30000));
  phase = 'provider tool response validation';
  assert.equal(result.model, process.env.NEMOTRON_MODEL);
  assert.equal(result.reply.tool_calls?.length, 1);
  const call = result.reply.tool_calls[0];
  assert.equal(call.function.name, 'report_readiness');
  assert.deepEqual(JSON.parse(call.function.arguments), {status: 'READY'});
  console.log('PASS: real NVIDIA function-call capability via production client; latencyMs=' + result.latencyMs + '. Incident investigation remains unverified.');
}
main().catch(error => {
  const code = ['MODEL_UNAVAILABLE', 'INVALID_MODEL_OUTPUT', 'RATE_LIMITED'].includes(error?.code) ? error.code : 'CHECK_FAILED';
  const http = /^Nemotron returned HTTP ([0-9]{3})$/.exec(error?.message ?? '')?.[1];
  console.error('FAIL: ' + phase + ' ' + code + (http ? ' HTTP_' + http : '') + '; no provider body or credential output');
  process.exitCode = 1;
});
