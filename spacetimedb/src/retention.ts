/** Settings govern preservation intent only; there is no purge or cleanup operation. */
export function defaultRetentionPolicy(incidentId: string) {
  return { id: incidentId, incidentId, indefinite: true, minimumRetentionDays: 30, hold: false, version: 0, updatedBy: undefined as string | undefined, updatedAt: undefined as string | undefined };
}
export function validateRetentionSettings(value: { indefinite: boolean; minimumRetentionDays: number; hold: boolean }) {
  if (typeof value.indefinite !== "boolean" || typeof value.hold !== "boolean" || !Number.isInteger(value.minimumRetentionDays) || value.minimumRetentionDays < 1 || value.minimumRetentionDays > 3650) throw new Error("INVALID_INPUT");
}
