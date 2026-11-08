// Run from the deployed release as an operator with its protected process environment.
// Accepts only the commander's existing AI_SERVICE invitation for one named synthetic incident.
import assert from 'node:assert/strict';
import {createClerkClient} from '@clerk/backend';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
let conn;
let phase = 'explicit configuration';
let backendError;
async function main() {
  const incidentId = process.env.BREACHBAY_SERVICE_INCIDENT_ID;
  assert.match(incidentId ?? '', /^inc_[0-9a-f]+$/);
  const clerk = createClerkClient({secretKey: process.env.CLERK_SECRET_KEY});
  const sid = process.env.AI_SERVICE_CLERK_SESSION_ID;
  const subject = process.env.AI_SERVICE_CLERK_USER_ID;
  assert.ok(sid && subject);
  phase = 'existing service session';
  const session = await clerk.sessions.getSession(sid);
  assert.equal(session.status, 'active');
  assert.equal(session.userId, subject);
  const token = await clerk.sessions.getToken(sid, undefined, 120);
  const imported = await import(pathToFileURL(join(process.cwd(), 'src/lib/backend/client.ts')).href);
  const backend = imported.default ?? imported;
  const {connectBackend, executeCommand, snapshotFromConnection} = backend;
  backendError = backend.backendError;
  phase = 'original scoped service lease';
  conn = await connectBackend({endpoint: process.env.SPACETIMEDB_ENDPOINT ?? process.env.NEXT_PUBLIC_SPACETIMEDB_ENDPOINT,
    database: process.env.SPACETIMEDB_DATABASE ?? process.env.NEXT_PUBLIC_SPACETIMEDB_DATABASE, token: token.jwt});
  const invitations = [...conn.db.myInvitations.iter()].filter(row => row.incidentId === incidentId && row.role === 'AI_SERVICE' && !row.accepted);
  assert.equal(invitations.length, 1);
  phase = 'commander invitation acceptance';
  const meta = {idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID()};
  const result = await executeCommand(conn, meta, () => conn.reducers.acceptInvitation({...meta, invitationId: invitations[0].id}));
  assert.equal(result.ok, true);
  const end = Date.now() + 4000;
  let snapshot;
  while (Date.now() < end) {
    snapshot = snapshotFromConnection(conn, incidentId);
    if (snapshot?.memberships.some(row => row.active && row.role === 'AI_SERVICE')) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  phase = 'committed synthetic membership';
  assert.equal(snapshot?.incident.classification, 'SYNTHETIC');
  const profile = [...conn.db.myProfile.iter()][0];
  assert.ok(snapshot.memberships.some(row => row.active && row.userId === profile.id && row.role === 'AI_SERVICE'));
  assert.equal([...conn.db.scopedApprovals.iter()].length, 0);
  console.log('PASS: dedicated service accepted commander-authorized AI_SERVICE invitation for named synthetic incident; no human approval authority');
}
main().catch(error => {
  const code = backendError?.(error)?.code ?? 'CHECK_FAILED';
  console.error('FAIL: ' + phase + ' ' + code + '; no credential/subject output');
  process.exitCode = 1;
}).finally(() => conn?.disconnect());
