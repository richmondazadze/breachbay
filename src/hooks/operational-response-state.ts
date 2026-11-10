import type { CommandMeta } from "@/lib/contracts";
import type { OperationalResponse, OperationalTarget, ResponsePreview } from "@/lib/response/contract";

export function previewIsFresh(preview: ResponsePreview, now: number) {
  const age = now - Date.parse(preview.observation.observedAt);
  return Number.isFinite(age) && age >= -5000 && age <= 120000;
}

export function targetMatchesPreview(target: OperationalTarget | undefined, preview: ResponsePreview) {
  return !!target?.active && target.connectorId === preview.connectorId && target.assetId === preview.assetId && target.instanceId === preview.observation.instanceId;
}

export function responseAvailability(response: OperationalResponse, target: OperationalTarget | undefined, now: number) {
  const expiry = Date.parse(response.approvalExpiresAt ?? "");
  return {
    expired: !Number.isFinite(expiry) || expiry <= now,
    targetChanged: !target?.active || target.version !== response.expectedTargetVersion || target.instanceId !== response.instanceId,
    withdrawable: !response.executionId && ["PENDING_APPROVAL", "APPROVED"].includes(response.status),
  };
}

/** A lost reply may be retried with the identical command, including its reviewed proof. */
export function retryableCommandMeta() {
  const attempts = new Map<string, { payload: string; meta: CommandMeta }>();
  return (action: string, payload: unknown): CommandMeta => {
    const serialized = JSON.stringify(payload);
    const prior = attempts.get(action);
    if (prior?.payload === serialized) return prior.meta;
    const meta = { idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() };
    attempts.set(action, { payload: serialized, meta });
    return meta;
  };
}
