import { getCanonicalRunId, getInvestigationAbortSignal, getRecoveredInvestigationResult, installInvestigationGateway } from '../../../lib/backend/investigation-gateway';
import { authFailure, canonicalInvestigationResult, recoverOrInvestigate } from '../../../lib/ai/http-result';
import { randomUUID } from 'node:crypto';
import type { StartInvestigationCommand } from '../../../lib/contracts';
import { getInvestigationGateway } from '../../../lib/ai/gateway';
import { investigate } from '../../../lib/ai/investigation';
import { AIError } from '../../../lib/ai/nemotron';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function POST(request: Request) {
  const correlationId = randomUUID();
  const error = (code: string, message: string, status: number) => Response.json({ ok: false, error: { code, message, retryable: status >= 500 || status === 429 }, correlationId }, { status });
  if (Number(request.headers.get('content-length') ?? 0) > 12000) return error('INVALID_INPUT', 'Request too large', 413);
  let body;
  try { const raw = await request.text(); if (raw.length > 12000) return error('INVALID_INPUT', 'Request too large', 413); body = JSON.parse(raw); } catch { return error('INVALID_INPUT', 'Expected JSON request', 400); }
  if (!body || typeof body.incidentId !== 'string' || !body.incidentId || typeof body.objective !== 'string' || !body.objective.trim() || body.objective.length > 2000 || typeof body.idempotencyKey !== 'string' || !body.idempotencyKey || body.idempotencyKey.length > 200) return error('INVALID_INPUT', 'Expected incidentId, objective and idempotencyKey', 400);
  // Route-local lazy installation survives Next.js worker boundaries without global bootstrap assumptions.
  if (!getInvestigationGateway()) installInvestigationGateway();
  const factory = getInvestigationGateway();
  if (!factory) return error('DEPENDENCY_UNAVAILABLE', 'Authenticated investigation backend is not connected', 503);
  const command: StartInvestigationCommand = { incidentId: body.incidentId, objective: body.objective, idempotencyKey: body.idempotencyKey, correlationId };
  try {
    const { session, ports } = await factory(request, command);
    if (session.user.status !== 'ACTIVE' || Date.parse(session.expiresAt) <= Date.now() || !Number.isFinite(Date.parse(session.expiresAt))) return error('UNAUTHENTICATED', 'Session is expired', 401);
    // Ports must persist idempotency and authorization in Spacetime; route has no DB administration authority.
    const backendSignal = getInvestigationAbortSignal(ports);
    const signal = backendSignal ? AbortSignal.any([request.signal, backendSignal]) : request.signal;
    const result = await recoverOrInvestigate(getRecoveredInvestigationResult(ports),
      () => investigate(command.incidentId, command.objective, ports, undefined, signal, backendSignal));
    const canonicalRunId = getCanonicalRunId(ports);
    if (!canonicalRunId) return error('DEPENDENCY_UNAVAILABLE', 'Canonical investigation identity unavailable', 503);
    return Response.json({ ok: true, data: canonicalInvestigationResult(result, canonicalRunId), correlationId });
  } catch (cause) {
    const authError = authFailure(cause);
    if (authError) return error(authError.code, authError.message, authError.status);
    const code = cause instanceof AIError ? cause.code : 'DEPENDENCY_UNAVAILABLE';
    return error(code, cause instanceof AIError ? cause.message : 'Investigation backend request failed', code === 'FORBIDDEN' ? 403 : code === 'INVALID_MODEL_OUTPUT' ? 422 : code === 'RATE_LIMITED' ? 429 : 503);
  }
}
