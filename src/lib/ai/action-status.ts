import { ACTION_STATES, type ActionStatus } from '../contracts';
export interface ActionStatusRead { incidentId: string; actionId: string; status: ActionStatus; version: number; expectedVersion: number; verification?: { status: 'VERIFIED_SUCCESS' | 'VERIFIED_PARTIAL' | 'VERIFIED_FAILED'; observedVersion: number; summary: string } }
/** Backend authenticates scoped read. This validator strips all non-allowlisted response fields. */
export function validateActionStatus(value: unknown, incidentId: string, actionId: string): ActionStatusRead {
  if (!value || typeof value !== 'object') throw new Error('INVALID_MODEL_OUTPUT');
  const v = value as ActionStatusRead;
  if (v.incidentId !== incidentId || v.actionId !== actionId || !ACTION_STATES.includes(v.status) || !Number.isSafeInteger(v.version) || v.version < 0 || !Number.isSafeInteger(v.expectedVersion) || v.expectedVersion < 0) throw new Error('INVALID_MODEL_OUTPUT');
  let verification: ActionStatusRead['verification'];
  if (v.verification !== undefined) {
    const r = v.verification;
    if (!r || !['VERIFIED_SUCCESS','VERIFIED_PARTIAL','VERIFIED_FAILED'].includes(r.status) || !Number.isSafeInteger(r.observedVersion) || r.observedVersion < 0 || typeof r.summary !== 'string' || r.summary.length > 1000) throw new Error('INVALID_MODEL_OUTPUT');
    verification = { status: r.status, observedVersion: r.observedVersion, summary: r.summary };
  }
  return { incidentId, actionId, status: v.status, version: v.version, expectedVersion: v.expectedVersion, ...(verification ? { verification } : {}) };
}
