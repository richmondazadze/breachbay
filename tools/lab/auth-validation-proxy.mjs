/** Narrow TLS-tunnel origin: only forwards the original-token validator to local Next. */
import { createServer } from 'node:http';
const port = Number(process.env.BREACHBAY_VALIDATOR_PORT ?? 3211);
const upstream = new URL(process.env.BREACHBAY_LOCAL_ORIGIN ?? 'http://localhost:3000');
if (upstream.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(upstream.hostname) || upstream.pathname !== '/' || upstream.username || upstream.password || upstream.search || upstream.hash) throw new Error('Loopback Next origin required');
createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  const bearer = request.headers.authorization;
  if (request.method !== 'POST' || request.url !== '/api/auth/validate') { response.writeHead(404).end(); return; }
  if (!bearer?.startsWith('Bearer ') || bearer.length > 16016 || Number(request.headers['content-length'] ?? 0) !== 0 || request.headers['transfer-encoding']) { response.writeHead(401).end(); return; }
  try {
    const result = await fetch(new URL('/api/auth/validate', upstream), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(12000), headers: { Authorization: bearer } });
    const body = await result.text();
    if (body.length > 8000) throw new Error('Oversized validator response');
    if (result.status !== 200) { response.writeHead(result.status === 401 || result.status === 403 ? result.status : 503).end(); return; }
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(body);
  } catch { response.writeHead(503).end(); }
}).listen(port, '127.0.0.1', () => process.stdout.write('Narrow local authentication validator is listening.\n'));
