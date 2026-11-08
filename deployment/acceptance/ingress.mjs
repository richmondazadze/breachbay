import assert from 'node:assert/strict';
const origin = process.env.BREACHBAY_APP_ORIGIN ?? 'https://breachbay.us';
const db = process.env.BREACHBAY_DB_ORIGIN ?? 'https://db.breachbay.us';
for (const path of ['/v1/database/breachbay/sql','/v1/database/breachbay/logs','/v1/database/other/subscribe','/v1/database/breachbay','/v1/identity','/v1/mcp','/metrics']) {
  const r = await fetch(db + path, {signal:AbortSignal.timeout(10000)});
  assert.equal(r.status, 403, `Unexpected public access to ${path}`);
}
const exchange = await fetch(db + '/v1/identity/websocket-token', {method:'POST',signal:AbortSignal.timeout(10000)});
assert.equal(exchange.status,401,'Anonymous token exchange must be denied');
const preflight = await fetch(db + '/v1/identity/websocket-token', {method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization'},signal:AbortSignal.timeout(10000)});
assert.equal(preflight.status,204);
assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
const foreign = await fetch(db + '/v1/identity/websocket-token', {method:'OPTIONS',headers:{Origin:'https://unrelated.invalid'},signal:AbortSignal.timeout(10000)});
assert.equal(foreign.headers.get('access-control-allow-origin'),null);
const home = await fetch(origin, {signal:AbortSignal.timeout(20000)});
assert.equal(home.status,200);
assert.ok((await home.text()).includes('BreachBay'));
for (const path of ['/api/auth/session','/api/evidence/example/original']) {
  const r=await fetch(origin+path,{headers:{Authorization:'Bearer invalid'},signal:AbortSignal.timeout(10000)});
  assert.equal(r.status,401,`Expected unauthorized ${path}`);
}
console.log('PASS: deployed TLS, homepage, ingress allowlist, CORS and anonymous denial');
