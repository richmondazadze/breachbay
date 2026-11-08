// Operator-only: map a UI-verified canonical profile ID to its exact existing human subject.
// No first-user bootstrap, token logging, session minting or production source edits.
import assert from 'node:assert/strict';
import {readFile, lstat, writeFile, rename} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';

async function main() {
  const id = process.env.BREACHBAY_COMMANDER_PROFILE_ID;
  assert.match(id ?? '', /^[0-9a-f]{64}$/, 'UI-verified canonical profile ID required');
  const folder = join(homedir(), '.config', 'breachbay');
  const path = join(folder, 'module.env');
  for (const target of [folder, path]) {
    const stat = await lstat(target);
    assert.ok(!stat.isSymbolicLink() && stat.uid === process.getuid());
    assert.equal(stat.mode & 0o077, 0, 'Operator configuration must be private');
  }
  assert.ok((await lstat(path)).isFile());
  const proofPath = join(folder, 'verified-commander.json');
  const proofStat = await lstat(proofPath);
  assert.ok(proofStat.isFile() && !proofStat.isSymbolicLink() && proofStat.uid === process.getuid() && (proofStat.mode & 0o077) === 0);
  const proof = JSON.parse(await readFile(proofPath, 'utf8'));
  assert.ok(proof.profileId === id && proof.verifiedFromAuthenticatedUi === true && proof.derivationRuntimeVerified === true);
  assert.match(proof.subject, /^user_[A-Za-z0-9]+$/);
  const original = await readFile(path, 'utf8');
  const current = original.split('\n').filter(line => !/^BOOTSTRAP_COMMANDER_SUBJECTS=/.test(line)).join('\n');
  const temporary = path + '.next-' + process.pid;
  await writeFile(temporary, current.trimEnd() + '\nBOOTSTRAP_COMMANDER_SUBJECTS=' + proof.subject + '\n', {flag: 'wx', mode: 0o600});
  await rename(temporary, path);
  console.log('PASS: exact UI-verified existing human subject configured; module republish and fresh read lease still required');
}
main().catch(() => {
  console.error('Commander configuration failed; no identities or credentials emitted.');
  process.exitCode = 1;
});
