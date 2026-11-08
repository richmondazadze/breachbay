// Operator-run with protected process environment. Never prints secret values or bodies.
import assert from 'node:assert/strict';
import {readdir, readFile, realpath} from 'node:fs/promises';
import {join, relative} from 'node:path';

const root = await realpath(process.env.BREACHBAY_RELEASE_PATH ?? process.cwd());
const origin = new URL(process.env.APP_ORIGIN ?? 'https://breachbay.us');
assert.equal(origin.protocol, 'https:');
assert.ok(!origin.username && !origin.password && !origin.search && !origin.hash && origin.pathname === '/');
const names = ['CLERK_SECRET_KEY', 'NEMOTRON_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY',
  'ELEVENLABS_API_KEY', 'AI_SERVICE_ID_TOKEN', 'AI_SERVICE_CLERK_SESSION_ID', 'AI_SERVICE_CLERK_USER_ID'];
const protectedValues = names.map(name => process.env[name]).filter(value => typeof value === 'string' && value.length >= 8);
assert.ok(protectedValues.length > 0, 'Protected environment must be supplied to perform this check');
let files = 0;
function inspect(bytes, label) {
  for (const value of protectedValues) {
    for (const representation of new Set([value, encodeURIComponent(value), JSON.stringify(value).slice(1, -1)])) {
      assert.ok(!bytes.includes(Buffer.from(representation)), `Server configuration appeared in browser artifact: ${label}`);
    }
  }
}
async function scan(directory) {
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const path = join(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), 'Browser artifact symlink requires explicit review');
    if (entry.isDirectory()) await scan(path);
    else if (entry.isFile()) {
      inspect(await readFile(path), relative(root, path));
      files++;
    }
  }
}
await scan(join(root, '.next', 'static'));
await scan(join(root, 'public'));
for (const path of ['/', '/api/health', '/.env', '/.env.local', '/.git/config', '/deployment/private/production.env']) {
  const response = await fetch(new URL(path, origin), {signal: AbortSignal.timeout(15000), redirect: 'manual'});
  if (path === '/' || path === '/api/health') assert.equal(response.status, 200, 'Public response unavailable');
  else assert.ok([403, 404].includes(response.status), 'Private source/configuration path was publicly exposed');
  inspect(Buffer.from(await response.arrayBuffer()), `public path ${path}`);
}
console.log(`PASS: ${files} browser artifacts and public responses contain no configured protected values; private paths denied`);
