/** Local-only authentication diagnosis and repair. Never publishes module code or creates identities. */
import { readFile, writeFile, rename, open, mkdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { parseEnv, promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

export function assertLocalConfiguration(env, settings) {
  if (env.APP_ORIGIN !== 'http://localhost:3000' ||
      env.SPACETIMEDB_ENDPOINT !== 'http://127.0.0.1:3210' ||
      env.NEXT_PUBLIC_SPACETIMEDB_ENDPOINT !== env.SPACETIMEDB_ENDPOINT ||
      env.SPACETIMEDB_DATABASE !== 'breachbay-local' ||
      env.NEXT_PUBLIC_SPACETIMEDB_DATABASE !== env.SPACETIMEDB_DATABASE ||
      settings.endpoint !== env.SPACETIMEDB_ENDPOINT || settings.database !== env.SPACETIMEDB_DATABASE ||
      !env.CLERK_SECRET_KEY?.startsWith('sk_test_') ||
      !env.AI_SERVICE_CLERK_SESSION_ID || !env.AI_SERVICE_CLERK_USER_ID ||
      settings.serviceUserId !== env.AI_SERVICE_CLERK_USER_ID) {
    throw new Error('LOCAL_CONFIGURATION_REQUIRED');
  }
  assertTunnelUrl(settings.authValidationUrl);
}

export function assertTunnelUrl(value) {
  if (typeof value !== 'string' || !/^https:\/\/[a-z]+(?:-[a-z]+)+\.trycloudflare\.com\/api\/auth\/validate$/.test(value)) {
    throw new Error('NARROW_TUNNEL_URL_REQUIRED');
  }
  return value;
}

// Do not inherit module environment variables: a repair changes exactly one value.
export function repairCommand(url, shellEnv = process.env) {
  assertTunnelUrl(url);
  const env = { AUTH_VALIDATION_URL: url };
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'SSL_CERT_FILE', 'SSL_CERT_DIR']) {
    if (shellEnv[key]) env[key] = shellEnv[key];
  }
  return {
    command: 'spacetime',
    args: ['publish', '--server', 'http://127.0.0.1:3210', '--env-only', '--no-config', '--yes=skip-login', 'breachbay-local'],
    env,
  };
}

async function request(url, method = 'GET', headers) {
  try { return await fetch(url, { method, headers, redirect: 'error', signal: AbortSignal.timeout(12000) }); }
  catch { return null; }
}

async function narrowRouteReady(url) {
  const [invalid, other] = await Promise.all([
    request(url, 'POST', { Authorization: 'Bearer invalid-local-diagnostic' }),
    request(new URL('/', url)),
  ]);
  const ready = invalid?.status === 401 && other?.status === 404;
  await Promise.all([invalid?.body?.cancel(), other?.body?.cancel()]);
  return ready;
}

async function verifyService(env) {
  const { createClerkClient } = await import('@clerk/backend');
  const { assertServiceUser, assertServiceSession } = await import('../../src/lib/backend/service-principal.ts');
  const { verifyIdToken } = await import('../../src/lib/backend/clerk-token.ts');
  const { connectBackend } = await import('../../src/lib/backend/client.ts');
  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
  assertServiceUser(await clerk.users.getUser(env.AI_SERVICE_CLERK_USER_ID), env.AI_SERVICE_CLERK_USER_ID);
  assertServiceSession(await clerk.sessions.getSession(env.AI_SERVICE_CLERK_SESSION_ID), env.AI_SERVICE_CLERK_USER_ID);
  // Refresh only the existing, explicitly configured service session. Never mint a human session.
  const issued = await clerk.sessions.getToken(env.AI_SERVICE_CLERK_SESSION_ID, undefined, 120);
  const claims = await verifyIdToken(issued.jwt);
  if (claims.sub !== env.AI_SERVICE_CLERK_USER_ID) throw new Error('SERVICE_IDENTITY_MISMATCH');
  let connection;
  try {
    connection = await connectBackend({ endpoint: env.SPACETIMEDB_ENDPOINT, database: env.SPACETIMEDB_DATABASE, token: issued.jwt });
    const profile = [...connection.db.myProfile.iter()][0];
    if (!profile || profile.platformAdmin || profile.status !== 'ACTIVE') throw new Error('SERVICE_PROFILE_DENIED');
  } finally { connection?.disconnect(); }
}

async function updateRoute(url, logFile) {
  const config = repairCommand(url);
  const log = await open(logFile, 'a', 0o600);
  try {
    await new Promise((accept, reject) => {
      const child = spawn(config.command, config.args, { env: config.env, timeout: 20000, stdio: ['ignore', log.fd, log.fd] });
      child.once('error', () => reject(new Error('AUTH_ROUTE_UPDATE_FAILED')));
      child.once('exit', code => code === 0 ? accept() : reject(new Error('AUTH_ROUTE_UPDATE_FAILED')));
    });
  } finally { await log.close(); }
}

async function saveJson(path, value) {
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await rename(temp, path);
}

export async function main(repair = false, renew = false) {
  const dir = resolve('deployment/private/production/local-stack-01');
  const env = parseEnv(await readFile('.env.local', 'utf8'));
  const settings = JSON.parse(await readFile(`${dir}/settings.json`, 'utf8'));
  assertLocalConfiguration(env, settings);
  Object.assign(process.env, env, { NODE_ENV: 'development' });
  const [health, database] = await Promise.all([
    request('http://localhost:3000/api/health'), request('http://127.0.0.1:3210/v1/ping'),
  ]);
  const webReady = health?.ok && (await health.json()).ready === true;
  await database?.body?.cancel();
  if (!webReady || !database?.ok) throw new Error('START_LOCAL_WEB_AND_DATABASE_FIRST');
  if (!await narrowRouteReady('http://127.0.0.1:3211/api/auth/validate')) throw new Error('START_NARROW_VALIDATOR_FIRST');
  if (!renew && await narrowRouteReady(settings.authValidationUrl)) {
    try {
      await verifyService(env);
      console.log('Local Clerk → validation route → SpacetimeDB: verified. Existing route retained.');
      return;
    } catch {
      // A functioning route with a failing identity must not trigger endless tunnel rotation.
      throw new Error('SERVICE_AUTHENTICATION_FAILED_ROUTE_IS_REACHABLE');
    }
  }
  if (!repair) throw new Error('AUTH_TUNNEL_UNAVAILABLE_RUN_LOCAL_REPAIR_AUTH');

  await mkdir(dir, { recursive: true, mode: 0o700 });
  const lockPath = `${dir}/auth-repair.lock`;
  const lock = await open(lockPath, 'wx', 0o600).catch(() => { throw new Error('AUTH_REPAIR_ALREADY_RUNNING'); });
  let tunnel, changed = false, committed = false;
  try {
    if (await readFile(`${dir}/settings.json`, 'utf8').then(JSON.parse).then(current => JSON.stringify(current) !== JSON.stringify(settings))) {
      throw new Error('LOCAL_SETTINGS_CHANGED_RETRY_CHECK');
    }
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    const previousTunnel = await readFile(`${dir}/renewed-tunnel.json`, 'utf8').then(JSON.parse).catch(() => null);
    const logPath = `${dir}/tunnel-${Date.now()}.log`;
    const log = await open(logPath, 'wx', 0o600);
    let startFailed = false;
    try {
      tunnel = spawn('cloudflared', ['tunnel', '--url', 'http://127.0.0.1:3211', '--no-autoupdate'], {
        detached: true, stdio: ['ignore', log.fd, log.fd],
        env: Object.fromEntries(Object.entries(repairCommand(settings.authValidationUrl).env).filter(([key]) => key !== 'AUTH_VALIDATION_URL')),
      });
      tunnel.once('error', () => { startFailed = true; });
    } finally { await log.close(); }
    let url;
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      if (startFailed || tunnel.exitCode !== null) throw new Error('AUTH_TUNNEL_START_FAILED');
      const output = await readFile(logPath, 'utf8');
      const origin = output.match(/https:\/\/[a-z]+(?:-[a-z]+)+\.trycloudflare\.com/)?.[0];
      if (origin && await narrowRouteReady(`${origin}/api/auth/validate`)) { url = `${origin}/api/auth/validate`; break; }
      await delay(500);
    }
    if (!url) throw new Error('AUTH_TUNNEL_START_TIMEOUT');
    console.log('Replacement narrow route is reachable. Updating only local AUTH_VALIDATION_URL.');
    // Mark attempted updates too: a CLI failure may still have reached the server.
    changed = true;
    await updateRoute(url, `${dir}/auth-repair.log`);
    await verifyService(env);
    await saveJson(`${dir}/settings.json`, { ...settings, authValidationUrl: url });
    committed = true;
    tunnel.unref();
    await saveJson(`${dir}/renewed-tunnel.json`, { url: new URL(url).origin, pid: tunnel.pid, createdAt: new Date().toISOString(), logPath });
    const processesPath = `${dir}/processes.json`;
    const processes = JSON.parse(await readFile(processesPath, 'utf8'));
    await saveJson(processesPath, { ...processes, tunnel: tunnel.pid, tunnelLog: logPath });
    // Never kill an arbitrary reused PID. Retire only our recorded narrow tunnel after validation.
    if (previousTunnel?.url === new URL(settings.authValidationUrl).origin && Number.isInteger(previousTunnel.pid) && previousTunnel.pid > 1 && previousTunnel.pid !== tunnel.pid) {
      try {
        const { stdout } = await promisify(execFile)('ps', ['-p', String(previousTunnel.pid), '-o', 'command=']);
        if (/^(?:\S*\/)?cloudflared tunnel --url http:\/\/127\.0\.0\.1:3211 --no-autoupdate$/.test(stdout.trim())) process.kill(previousTunnel.pid, 'SIGTERM');
      } catch { /* A previously expired tunnel may already have exited. */ }
    }
    console.log('Local authentication repaired and verified. Database code, records, identities and permissions retained.');
  } catch (error) {
    if (changed && !committed) {
      try { await updateRoute(settings.authValidationUrl, `${dir}/auth-repair.log`); }
      catch {
        // Keep the candidate alive if the server might still point at it. Never declare repair successful.
        tunnel?.unref();
        tunnel = undefined;
        throw new Error('AUTH_REPAIR_UNCONFIRMED_ROLLBACK_FAILED_CHECK_PRIVATE_LOG');
      }
    }
    throw error;
  } finally {
    if (!committed) tunnel?.kill('SIGTERM');
    await lock.close();
    await unlink(lockPath);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length > 2 || args.some(arg => !['--repair', '--renew'].includes(arg)) || (args.includes('--renew') && !args.includes('--repair'))) {
    console.error('Usage: npm run local:check OR npm run local:repair-auth [-- --renew]');
    process.exitCode = 1;
  } else {
    main(args.includes('--repair'), args.includes('--renew')).catch(error => {
      // Output fixed reason codes only; provider/SDK exceptions may contain credentials.
      const code = /^[A-Z][A-Z_]+$/.test(error?.message ?? '') ? error.message : 'LOCAL_AUTH_CHECK_FAILED';
      console.error(code);
      process.exitCode = 1;
    });
  }
}
