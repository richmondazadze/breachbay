import { sha256 } from "../../../spacetimedb/src/hash";
import { MAX_LOG_RECORDS, validateObservation, type LogObservation } from "./log-types";

export function observedAssetId(incidentId: string, host: string) {
  return `asset_${sha256(JSON.stringify([incidentId, host.toLowerCase()]))}`;
}
/** This exact manifest is verified again by the transactional backend. No raw free text. */
export function logDerivative(incidentId: string, observations: LogObservation[]): string {
  if (!observations.length || observations.length > MAX_LOG_RECORDS) throw new Error("Invalid event count");
  const events = observations.map(value => {
    const o = validateObservation(value);
    return { ...o, host: observedAssetId(incidentId, o.host), ...(o.sourceHost ? { sourceHost: observedAssetId(incidentId, o.sourceHost) } : {}), ...(o.destinationHost ? { destinationHost: observedAssetId(incidentId, o.destinationHost) } : {}) };
  });
  const derivative = JSON.stringify({ schema: "breachbay.observations.v1", events });
  if (derivative.length > 32000) throw new Error("Split this log into smaller batches.");
  return derivative;
}

export function validateObservationBatch(value: unknown): LogObservation[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_LOG_RECORDS) throw new Error("Invalid event count");
  const records = value.map(validateObservation);
  if (new Set(records.map(r => r.line)).size !== records.length) throw new Error("Duplicate line reference");
  return records;
}
