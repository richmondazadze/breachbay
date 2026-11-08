// Public deployment check; does not inspect browser/session state or print nonces.
import assert from 'node:assert/strict';
const origin = process.env.BREACHBAY_APP_ORIGIN ?? 'https://breachbay.us';
const nonces = [];
for (let request = 0; request < 2; request++) {
  const response = await fetch(origin, {signal: AbortSignal.timeout(20000)});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000');
  const csp = response.headers.get('content-security-policy');
  assert.ok(csp);
  const scripts = csp.split(';').map(value => value.trim()).find(value => value.startsWith('script-src '));
  assert.ok(scripts?.includes("'strict-dynamic'"));
  assert.ok(!scripts.includes("'unsafe-inline'") && !scripts.includes("'unsafe-eval'"));
  assert.ok(csp.includes("script-src-attr 'none'") && csp.includes("object-src 'none'"));
  const nonce = /'nonce-([^']+)'/.exec(scripts)?.[1];
  assert.ok(nonce);
  const tags = [...(await response.text()).matchAll(/<script\b([^>]*)>/g)];
  assert.ok(tags.length > 0);
  for (const tag of tags) assert.equal(/\bnonce="([^"]+)"/.exec(tag[1])?.[1], nonce);
  nonces.push(nonce);
}
assert.notEqual(nonces[0], nonces[1]);
console.log('PASS: fresh per-request script nonces, strict CSP and HTTPS enforcement on public deployment');
