import { test } from 'node:test';
import assert from 'node:assert/strict';
import { originalTokenWindow, AcceptanceLifetimeError } from './lifetime';
const now = 1800000000000;
const origin = 'https://breachbay.us';
// Synthetic unsigned parsing fixture only; never an authentication substitute.
const fixture = (claims: object) => `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
test('ordinary 60-second browser JWT gets bounded remaining window', () => {
  const token = fixture({ exp: now / 1000 + 60, sid: 'synthetic-session', azp: origin });
  const w = originalTokenWindow(token, origin, now);
  assert.equal(w.remaining(now), 55000);
  assert.equal(w.remaining(now + 30000), 25000);
  assert.equal(w.expiresAt, now + 60000);
  assert.throws(() => w.remaining(now + 55000), AcceptanceLifetimeError);
  assert.throws(() => w.signal(90000, now + 55000), /no further requests/);
});
test('preflight rejects expired/near-expired and nonbrowser claims without editing them', () => {
  for (const claims of [
    { exp: now / 1000 + 45, sid: 'synthetic', azp: origin },
    { exp: now / 1000 - 1, sid: 'synthetic', azp: origin },
    { exp: now / 1000 + 120, sid: 'synthetic' },
    { exp: now / 1000 + 60, sid: 'synthetic', azp: 'https://other.invalid' },
  ]) assert.throws(() => originalTokenWindow(fixture(claims), origin, now), AcceptanceLifetimeError);
  assert.throws(() => originalTokenWindow('malformed', origin, now), /malformed/);
});
