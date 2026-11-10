import { EVENT_TYPES, MAX_LOG_RECORDS, validateObservation, type EventType } from "./log-types";

/** A display-only view. Unknown fields or invalid rows fall back to the exact payload. */
export function reviewLogDerivative(content: string) {
  try {
    const candidate: unknown = JSON.parse(content);
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const value = candidate as Record<string, unknown>;
    if (value.schema !== "breachbay.observations.v1"
      || Object.keys(value).some(key => key !== "schema" && key !== "events")
      || !Array.isArray(value.events) || !value.events.length || value.events.length > MAX_LOG_RECORDS) return null;
    const events = value.events.map(validateObservation);
    if (new Set(events.map(event => event.line)).size !== events.length) return null;
    const hosts = new Set(events.flatMap(event => [event.host, event.sourceHost, event.destinationHost].filter((host): host is string => Boolean(host))));
    if ([...hosts].some(host => !/^asset_[a-f0-9]{64}$/.test(host))) return null;
    const counts = Object.fromEntries(EVENT_TYPES.map(type => [type, events.filter(event => event.eventType === type).length])) as Record<EventType, number>;
    const times = events.map(event => Date.parse(event.timestamp));
    return { events, counts, hostCount: hosts.size, start: new Date(Math.min(...times)).toISOString(), end: new Date(Math.max(...times)).toISOString() };
  } catch {
    return null;
  }
}
