import test from 'node:test';
import assert from 'node:assert/strict';
import { assertLocalConfiguration, assertTunnelUrl, repairCommand } from '../../tools/lab/local-auth.mjs';

const url = 'https://local-test-auth-route.trycloudflare.com/api/auth/validate';
const env = {
  APP_ORIGIN: 'http://localhost:3000', SPACETIMEDB_ENDPOINT: 'http://127.0.0.1:3210',
  NEXT_PUBLIC_SPACETIMEDB_ENDPOINT: 'http://127.0.0.1:3210', SPACETIMEDB_DATABASE: 'breachbay-local',
  NEXT_PUBLIC_SPACETIMEDB_DATABASE: 'breachbay-local', CLERK_SECRET_KEY: 'sk_test_fixture',
  AI_SERVICE_CLERK_USER_ID: 'service-fixture', AI_SERVICE_CLERK_SESSION_ID: 'session-fixture',
};
const settings = { endpoint: env.SPACETIMEDB_ENDPOINT, database: env.SPACETIMEDB_DATABASE, serviceUserId: env.AI_SERVICE_CLERK_USER_ID, authValidationUrl: url };

test('local recovery refuses production, mismatched browser/database settings and foreign service identities', () => {
  assert.doesNotThrow(() => assertLocalConfiguration(env, settings));
  for (const patch of [
    { APP_ORIGIN: 'https://breachbay.us' }, { CLERK_SECRET_KEY: 'sk_live_fixture' },
    { SPACETIMEDB_ENDPOINT: 'http://127.0.0.1:3210@remote.example' },
    { NEXT_PUBLIC_SPACETIMEDB_DATABASE: 'production' }, { SPACETIMEDB_DATABASE: 'production' },
    { AI_SERVICE_CLERK_USER_ID: 'human-fixture' }, { AI_SERVICE_CLERK_SESSION_ID: '' },
  ]) assert.throws(() => assertLocalConfiguration({ ...env, ...patch }, settings), /LOCAL_CONFIGURATION_REQUIRED/);
});

test('auth route is exact: no alternate recipient, credentials, query, fragment or path', () => {
  assert.equal(assertTunnelUrl(url), url);
  for (const value of [
    url + '?token=fixture', url + '#fragment', url.replace('/api/auth/validate', '/'),
    url.replace('https:', 'http:'), url.replace('trycloudflare.com', 'trycloudflare.com.attacker.example'),
    url.replace('https://', 'https://user:pass@'), 'https://attacker.example/api/auth/validate', null,
  ]) assert.throws(() => assertTunnelUrl(value), /NARROW_TUNNEL_URL_REQUIRED/);
});

test('repair command cannot inherit signing keys, bootstrap grants, credential settings or public target', () => {
  const command = repairCommand(url, {
    HOME: '/fixture', PATH: '/usr/bin', OIDC_ISSUER: 'foreign', RESPONSE_SIGNING_KEY: 'secret-fixture',
    SERVICE_SUBJECTS: 'human', BOOTSTRAP_COMMANDER_SUBJECTS: 'human', CLERK_SECRET_KEY: 'secret-fixture',
    AUTH_VALIDATION_URL: 'https://foreign.example/api/auth/validate',
  });
  assert.deepEqual(command.env, { AUTH_VALIDATION_URL: url, HOME: '/fixture', PATH: '/usr/bin' });
  assert.deepEqual(command.args, ['publish', '--server', 'http://127.0.0.1:3210', '--env-only', '--no-config', '--yes=skip-login', 'breachbay-local']);
  assert.doesNotMatch(JSON.stringify(command), /secret-fixture|foreign|--replace-env|--unset-env|--module-path|--delete-data/);
});
