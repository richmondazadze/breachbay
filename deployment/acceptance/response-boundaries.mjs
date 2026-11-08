// Actual scoped service negative checks against an explicit synthetic proposal. No human token minting.
import assert from 'node:assert/strict';
import {createClerkClient} from '@clerk/backend';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
let phase = 'configuration';
async function main() {
  const required = name => { const value = process.env[name]; assert.ok(value); return value; };
  const load = async path => { const imported = await import(pathToFileURL(join(process.cwd(), path)).href); return imported.default ?? imported; };
  const {connectBackend, snapshotFromConnection, executeCommand} = await load('src/lib/backend/client.ts');
  const {assertServiceSession} = await load('src/lib/backend/service-session-operator.ts');
  const clerk = createClerkClient({secretKey: required('CLERK_SECRET_KEY')});
  const sessionId = required('AI_SERVICE_CLERK_SESSION_ID');
  assertServiceSession(await clerk.sessions.getSession(sessionId), required('AI_SERVICE_CLERK_USER_ID'));
  const token = await clerk.sessions.getToken(sessionId, process.env.CLERK_JWT_TEMPLATE, 120);
  const incidentId = required('BREACHBAY_RESPONSE_INCIDENT_ID');
  const proposalId = required('BREACHBAY_RESPONSE_PROPOSAL_ID');
  const conn = await connectBackend({endpoint: process.env.SPACETIMEDB_ENDPOINT ?? required('NEXT_PUBLIC_SPACETIMEDB_ENDPOINT'), database: process.env.SPACETIMEDB_DATABASE ?? required('NEXT_PUBLIC_SPACETIMEDB_DATABASE'), token: token.jwt});
  try {
    phase = 'actual scoped proposal';
    const before = snapshotFromConnection(conn, incidentId);
    const actor = [...conn.db.myProfile.iter()][0];
    assert.equal(before?.incident.classification, 'SYNTHETIC');
    assert.ok(before.memberships.some(m => m.active && m.userId === actor.id && m.role === 'AI_SERVICE'));
    const proposal = before.proposals.find(p => p.id === proposalId);
    assert.ok(proposal);
    const meta = () => ({incidentId, proposalId, expectedVersion: before.incident.scenarioVersion, idempotencyKey: randomUUID(), correlationId: randomUUID()});
    phase = 'AI approval denial';
    const approval = {...meta(), proposalVersion: proposal.version, decision: 'APPROVE', justification: 'Synthetic negative acceptance: AI service must never approve.'};
    const deniedApproval = await executeCommand(conn, approval, () => conn.reducers.approveAction(approval));
    const allowedCodes = new Set(['FORBIDDEN','UNAUTHENTICATED','VERSION_CONFLICT','INVALID_TRANSITION','DEPENDENCY_UNAVAILABLE','INVALID_INPUT']);
    console.log(JSON.stringify({actualServiceApprovalAttempt:true,ok:deniedApproval.ok,denialCode:deniedApproval.ok?undefined:allowedCodes.has(deniedApproval.error.code)?deniedApproval.error.code:'UNCLASSIFIED'}));
    assert.equal(deniedApproval.ok, false);
    assert.equal(deniedApproval.error.code, 'FORBIDDEN');
    phase = 'AI execution denial';
    const execution = meta();
    const deniedExecution = await executeCommand(conn, execution, () => conn.reducers.executeSimulation(execution));
    console.log(JSON.stringify({actualServiceExecutionAttempt:true,ok:deniedExecution.ok,denialCode:deniedExecution.ok?undefined:allowedCodes.has(deniedExecution.error.code)?deniedExecution.error.code:'UNCLASSIFIED'}));
    assert.equal(deniedExecution.ok, false);
    assert.equal(deniedExecution.error.code, 'FORBIDDEN');
    const after = snapshotFromConnection(conn, incidentId);
    assert.equal(after.incident.scenarioVersion, before.incident.scenarioVersion);
    assert.equal(after.proposals.find(p => p.id === proposalId)?.status, proposal.status);
    assert.equal(after.proposals.find(p => p.id === proposalId)?.payloadDigest, proposal.payloadDigest);
    console.log('PASS: actual incident-granted Clerk service denied approval and execution of the real synthetic proposal; scenario and proposal unchanged');
  } finally { conn.disconnect(); }
}
// Optional official same-service sign-in for role tests. Never edits application configuration,
// refreshes a human identity, invents JWT claims, or leaves the temporary session active.
async function run() {
  if (!process.argv.includes('--fresh-service-sign-in')) return main();
  phase = 'official temporary service sign-in';
  const clerk = createClerkClient({secretKey: process.env.CLERK_SECRET_KEY});
  const imported = await import(pathToFileURL(join(process.cwd(), 'src/lib/backend/service-session-operator.ts')).href);
  const {assertServiceUser, assertServiceSession} = imported.default ?? imported;
  const identity = process.env.AI_SERVICE_CLERK_USER_ID;
  assert.ok(identity);
  assertServiceUser(await clerk.users.getUser(identity), identity);
  assertServiceSession(await clerk.sessions.getSession(process.env.AI_SERVICE_CLERK_SESSION_ID), identity);
  const issuer = process.env.CLERK_ISSUER_URL, origin = process.env.APP_ORIGIN;
  assert.equal(issuer, 'https://clerk.breachbay.us');
  assert.equal(origin, 'https://breachbay.us');
  let ticket, temporarySession;
  const originalSession = process.env.AI_SERVICE_CLERK_SESSION_ID;
  try {
    ticket = await clerk.signInTokens.createSignInToken({userId:identity, expiresInSeconds:300});
    const response = await fetch(issuer + '/v1/client/sign_ins', {
      method:'POST', headers:{Origin:origin, 'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({strategy:'ticket', ticket:ticket.token}), signal:AbortSignal.timeout(20000)
    });
    const data = await response.json();
    if (typeof data.response?.created_session_id === 'string' && /^sess_[A-Za-z0-9]+$/.test(data.response.created_session_id)) temporarySession = data.response.created_session_id;
    assert.ok(response.ok && data.response?.status === 'complete' && temporarySession);
    assertServiceSession(await clerk.sessions.getSession(temporarySession), identity);
    const token = await clerk.sessions.getToken(temporarySession, process.env.CLERK_JWT_TEMPLATE, 120);
    const authModule = await import(pathToFileURL(join(process.cwd(), 'src/lib/backend/clerk-token.ts')).href);
    const {verifyIdToken, authenticatedAt} = authModule.default ?? authModule;
    const claims = await verifyIdToken(token.jwt);
    assert.equal(claims.sub, identity); assert.equal(claims.sid, temporarySession);
    const verifiedAt = authenticatedAt(claims);
    const fresh = verifiedAt > 0 && Date.now()/1000 - verifiedAt <= 900;
    console.log(JSON.stringify({officialTemporaryServiceSignIn:true, signedFactorFresh:fresh, configurationChanged:false}));
    phase = 'official service signed factor freshness';
    assert.ok(fresh, 'No role-denial proof without genuine signed recent factor age');
    process.env.AI_SERVICE_CLERK_SESSION_ID = temporarySession;
    await main();
  } finally {
    process.env.AI_SERVICE_CLERK_SESSION_ID = originalSession;
    if (temporarySession) {
      const session = await clerk.sessions.getSession(temporarySession);
      assert.equal(session.userId, identity);
      await clerk.sessions.revokeSession(temporarySession);
      assert.equal((await clerk.sessions.getSession(temporarySession)).status, 'revoked');
      console.log('PASS: temporary service session revoked; original service configuration retained');
    }
    // A completed ticket sign-in already consumes the one-use ticket. Clerk may reject
    // a subsequent revocation of that consumed ticket; session revocation remains mandatory.
    if (ticket) await clerk.signInTokens.revokeSignInToken(ticket.id).catch(() => {});
  }
}
run().catch(() => { console.error('FAIL: ' + phase + '; no credentials or operational contents output'); process.exitCode = 1; });
