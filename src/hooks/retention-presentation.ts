import type { IncidentRetentionPolicy, IncidentSnapshot } from "@/lib/contracts";
export interface RetentionDraft { indefinite: boolean; hold: boolean; days: string; version: number }
export const retentionDraft = (policy: IncidentRetentionPolicy): RetentionDraft => ({ indefinite: policy.indefinite, hold: policy.hold, days: String(policy.minimumRetentionDays), version: policy.version });
export function canEditRetention(snapshot: IncidentSnapshot, userId?: string): boolean {
  return !!userId && snapshot.memberships.some(m => m.incidentId === snapshot.incident.id && m.userId === userId && m.active && m.role === "COMMANDER");
}
export function validRetentionDraft(draft: RetentionDraft, policy: IncidentRetentionPolicy, reason: string): boolean {
  const days = Number(draft.days);
  return draft.version === policy.version && !!draft.days.trim() && Number.isInteger(days) && days >= 1 && days <= 3650 && reason.trim().length > 0 && reason.trim().length <= 1000;
}
