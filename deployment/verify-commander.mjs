// Read-only identity proof. No human token minting or arbitrary first-user privilege.
// Mirrors official SpacetimeDB v2.14.1 crates/lib/src/identity.rs::Identity::from_claims.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createClerkClient} from '@clerk/backend';
import {blake3} from '/tmp/breachbay-identity-tools/node_modules/@noble/hashes/blake3.js';
let phase = 'configuration';
async function main() {
  const expected = process.env.BREACHBAY_COMMANDER_PROFILE_ID;
  const issuer = process.env.CLERK_ISSUER_URL;
  const origin = process.env.APP_ORIGIN;
  assert.match(expected ?? '', /^[0-9a-f]{64}$/);
  assert.ok(issuer && origin && process.env.CLERK_SECRET_KEY?.startsWith('sk_live_'));
  function identity(subject) {
    const digest = Buffer.from(blake3(Buffer.from(issuer + '|' + subject))).subarray(0, 26);
    const input = Buffer.concat([Buffer.from([0xc2, 0]), digest]);
    return Buffer.concat([Buffer.from([0xc2, 0]), Buffer.from(blake3(input)).subarray(0, 4), digest]).toString('hex');
  }
  const client = createClerkClient({secretKey: process.env.CLERK_SECRET_KEY});
  phase = 'dedicated application lookup';
  const users = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const page = await client.users.getUserList({limit: 100, offset});
    users.push(...page.data);
    if (users.length >= page.totalCount) break;
    assert.ok(offset < 900, 'Explicit larger-directory review required');
  }
  const services = users.filter(user => user.externalId === 'breachbay-investigation-service');
  assert.equal(services.length, 1);
  assert.ok(!services[0].banned && !services[0].locked);
  phase = 'official identity derivation runtime check';
  const serviceSessions = await client.sessions.getSessionList({userId: services[0].id, status: 'active', limit: 2});
  assert.equal(serviceSessions.totalCount, 1);
  const token = await client.sessions.getToken(serviceSessions.data[0].id, undefined, 120);
  const response = await fetch(origin + '/api/auth/session', {
    headers: {Authorization: 'Bearer ' + token.jwt}, signal: AbortSignal.timeout(25000),
  });
  assert.equal(response.status, 200);
  const actual = await response.json();
  assert.equal(actual.ok, true);
  assert.equal(actual.data.user.id, identity(services[0].id));
  assert.equal(actual.data.user.platformAdmin, false);
  phase = 'exact signed-in human match';
  const matches = users.filter(user => identity(user.id) === expected && user.id !== services[0].id);
  assert.equal(matches.length, 1);
  const human = matches[0];
  assert.ok(!human.banned && !human.locked && human.externalId !== 'breachbay-investigation-service');
  const sessions = await client.sessions.getSessionList({userId: human.id, status: 'active', limit: 1});
  assert.ok(sessions.totalCount > 0);
  phase = 'private verification artifact';
  await writeFile('deployment/private/verified-commander.json', JSON.stringify({
    profileId: expected, subject: human.id, issuer, verifiedFromAuthenticatedUi: true,
    derivationRuntimeVerified: true, verifiedAt: new Date().toISOString(),
  }) + '\n', {flag: 'wx', mode: 0o600});
  console.log('PASS: official derivation matches live service identity and the exact active signed-in human; no human credential minted');
}
main().catch(() => {
  console.error('Identity proof failed at ' + phase + '; no credentials or account details emitted.');
  process.exitCode = 1;
});
