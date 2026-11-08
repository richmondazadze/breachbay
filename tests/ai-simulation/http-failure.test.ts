import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIError } from '../../src/lib/ai/nemotron';
import { aiFailure, investigationFailure } from '../../src/lib/ai/http-result';
import { ERROR_CODES } from '../../src/lib/contracts';
import { AuthError } from '../../src/lib/backend/clerk-token';
import { BackendCommandError, committedCommandData } from '../../src/lib/backend/command-error';

test('canonical backend codes preserve actionable errors without suggesting permission/version retries', () => {
  for (const code of ERROR_CODES) {
    const failure = aiFailure(new AIError(code, 'Review current scoped state before retrying'))!;
    assert.equal(failure.code, code);
    assert.equal(failure.message, 'Review current scoped state before retrying');
    assert(Number.isInteger(failure.status));
    const transient = ['MODEL_UNAVAILABLE', 'DEPENDENCY_UNAVAILABLE', 'RATE_LIMITED'].includes(code);
    assert.equal(failure.status >= 500 || failure.status === 429, transient);
  }
  assert.equal(aiFailure(new AIError('INVALID_TRANSITION', 'Commander must advance incident lifecycle'))?.status, 409);
  assert.equal(aiFailure(new AIError('VERSION_CONFLICT', 'Reload current scenario'))?.status, 409);
  assert.equal(aiFailure(new AIError('FORBIDDEN', 'Permission denied'))?.status, 403);
  assert.equal(aiFailure(new Error('Untrusted transport error')), undefined);
});

test('committed backend denials retain AuthError guard ancestry and reach the route helper as HTTP 409', () => {
  for (const code of ['INVALID_TRANSITION', 'VERSION_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'APPROVAL_EXPIRED'] as const) {
    let denial: unknown;
    try { committedCommandData({ ok: false, error: { code, message: 'CONTROL_BACKEND_TEXT_DO_NOT_EXPOSE', retryable: true }, correlationId: 'control' }); } catch (error) { denial = error; }
    assert(denial instanceof BackendCommandError && denial instanceof AuthError);
    const failure = investigationFailure(denial);
    assert.equal(failure.code, code); assert.equal(failure.status, 409);
    assert(!failure.message.includes('CONTROL_'));
    assert.equal(aiFailure(denial), undefined);
  }
});
