/** Observations describe recorded events; they never assert compromise or current health. */
export const LOG_FORMATS = ["breachbay-jsonl", "nginx-combined"] as const;
export type LogFormat = (typeof LOG_FORMATS)[number];
export const EVENT_TYPES = ["http.request", "auth.login", "network.connection", "database.query"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export interface LogObservation {
  line: number;
  timestamp: string;
  eventType: EventType;
  host: string;
  sourceHost?: string;
  destinationHost?: string;
  outcome: "success" | "failure" | "observed";
  protocol?: "http" | "https" | "tcp" | "udp" | "sqlite";
  sourcePort?: number;
  destinationPort?: number;
  httpStatus?: number;
  httpMethod?: string;
  bytes?: number;
}
export const MAX_LOG_RECORDS = 100;
export const MAX_LOG_BYTES = 256 * 1024;
export function validHost(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,199}$/.test(value);
}
export function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = value.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,6})?(?:Z|([+-])(\d\d):(\d\d))$/);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] = match;
  if (+hour > 23 || +minute > 59 || +second > 59 || +(offsetHour ?? 0) > 14 || +(offsetMinute ?? 0) > 59 || +offsetHour === 14 && +offsetMinute !== 0) return false;
  const date = new Date(0); date.setUTCFullYear(+year, +month - 1, +day);
  return date.getUTCFullYear() === +year && date.getUTCMonth() === +month - 1 && date.getUTCDate() === +day;
}
export function validateObservation(value: unknown): LogObservation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid event record");
  const o = value as LogObservation;
  const keys = ["line", "timestamp", "eventType", "host", "sourceHost", "destinationHost", "outcome", "protocol", "sourcePort", "destinationPort", "httpStatus", "httpMethod", "bytes"];
  if (Object.keys(o).some(k => !keys.includes(k)) || !Number.isInteger(o.line) || o.line < 1 || o.line > 100000 || !validTimestamp(o.timestamp) || !EVENT_TYPES.includes(o.eventType) || !validHost(o.host) || !["success", "failure", "observed"].includes(o.outcome)) throw new Error("Invalid event record");
  for (const key of ["sourceHost", "destinationHost"] as const) if (o[key] !== undefined && !validHost(o[key])) throw new Error("Invalid host reference");
  if (o.protocol !== undefined && !["http", "https", "tcp", "udp", "sqlite"].includes(o.protocol)) throw new Error("Invalid protocol");
  for (const key of ["sourcePort", "destinationPort"] as const) if (o[key] !== undefined && (!Number.isInteger(o[key]) || o[key]! < 1 || o[key]! > 65535)) throw new Error("Invalid port");
  if (o.httpStatus !== undefined && (!Number.isInteger(o.httpStatus) || o.httpStatus < 100 || o.httpStatus > 599)) throw new Error("Invalid HTTP status");
  if (o.httpMethod !== undefined && !["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "CONNECT", "TRACE"].includes(o.httpMethod)) throw new Error("Invalid HTTP method");
  if (o.bytes !== undefined && (!Number.isSafeInteger(o.bytes) || o.bytes < 0)) throw new Error("Invalid byte count");
  return o;
}
