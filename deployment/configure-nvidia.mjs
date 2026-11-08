// Run only after the human confirms saving the protected key entry file.
// Parses configuration as data; never executes the user-edited file or prints credentials/bodies.
import assert from 'node:assert/strict';
import {lstat, readFile, writeFile, rename} from 'node:fs/promises';
const path = 'deployment/private/nvidia.env';
let phase = 'protected key entry';
async function main() {
  const stat = await lstat(path);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o077) === 0);
  const entries = (await readFile(path, 'utf8')).split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  const keys = entries.filter(line => line.startsWith('NEMOTRON_API_KEY='));
  assert.equal(keys.length, 1);
  let key = keys[0].slice('NEMOTRON_API_KEY='.length).trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) key = key.slice(1, -1);
  assert.match(key, /^nvapi-[A-Za-z0-9_-]{20,300}$/);
  phase = 'hosted NVIDIA model catalogue';
  const response = await fetch('https://integrate.api.nvidia.com/v1/models', {
    headers: {Authorization: 'Bearer ' + key}, signal: AbortSignal.timeout(20000), redirect: 'error',
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(Array.isArray(body.data));
  const ids = body.data.map(model => model.id).filter(id => typeof id === 'string' && id.startsWith('nvidia/') && id.toLowerCase().includes('nemotron'));
  // Active hosted tool-capable families; legacy catalogue entries may return 404 at inference.
  const preferred = ['nvidia/nemotron-3.5-lightning-30b-a3b', 'nvidia/nemotron-nano-3-30b-a3b', 'nvidia/nemotron-3-super-120b-a12b'];
  const model = preferred.find(id => ids.includes(id));
  if (!model) {
    console.log('Available NVIDIA Nemotron model identifiers: ' + JSON.stringify(ids));
    throw new Error('Explicit model selection required');
  }
  phase = 'private inference configuration';
  const temporary = path + '.next-' + process.pid;
  await writeFile(temporary, 'NEMOTRON_API_KEY=' + key + '\nNEMOTRON_BASE_URL=https://integrate.api.nvidia.com/v1\nNEMOTRON_MODEL=' + model + '\n', {flag: 'wx', mode: 0o600});
  await rename(temporary, path);
  console.log('PASS: hosted NVIDIA credentials accepted by model catalogue; selected ' + model + '. Real tool investigation remains unverified.');
}
main().catch(() => {
  console.error('NVIDIA setup failed at ' + phase + '; no credential or provider body output.');
  process.exitCode = 1;
});
