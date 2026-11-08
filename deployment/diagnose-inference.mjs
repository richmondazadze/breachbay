// Operator-only bridge to the no-write diagnostic. Protected configuration is process environment.
import {createClerkClient} from '@clerk/backend';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';

async function main() {
  const required = name => {
    const value = process.env[name];
    if (!value) throw new Error('SETUP_FAILED');
    return value;
  };
  const client = createClerkClient({secretKey: required('CLERK_SECRET_KEY')});
  const imported = await import(pathToFileURL(join(process.cwd(), 'src/lib/backend/service-session-operator.ts')).href);
  const {assertServiceSession} = imported.default ?? imported;
  const sessionId = required('AI_SERVICE_CLERK_SESSION_ID');
  assertServiceSession(await client.sessions.getSession(sessionId), required('AI_SERVICE_CLERK_USER_ID'));
  const token = await client.sessions.getToken(sessionId, process.env.CLERK_JWT_TEMPLATE, 120);
  process.env.BREACHBAY_DIAGNOSTIC_SERVICE_TOKEN = token.jwt;
  process.env.BREACHBAY_DIAGNOSTIC_SPACETIME_ENDPOINT = process.env.SPACETIMEDB_ENDPOINT ?? required('NEXT_PUBLIC_SPACETIMEDB_ENDPOINT');
  process.env.BREACHBAY_DIAGNOSTIC_DATABASE = process.env.SPACETIMEDB_DATABASE ?? required('NEXT_PUBLIC_SPACETIMEDB_DATABASE');
  required('BREACHBAY_DIAGNOSTIC_INCIDENT_ID');
  await import(pathToFileURL(join(process.cwd(), 'tests/ai-simulation/diagnose-live.mjs')).href);
}
main().catch(() => {
  console.error('DIAGNOSTIC_SETUP_FAILED; no credential, provider body or exception text output');
  process.exitCode = 1;
}).finally(() => { delete process.env.BREACHBAY_DIAGNOSTIC_SERVICE_TOKEN; });
