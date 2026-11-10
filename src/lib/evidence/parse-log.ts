import { LOG_FORMATS, MAX_LOG_BYTES, MAX_LOG_RECORDS, validHost, validateObservation, type LogFormat, type LogObservation } from "./log-types";

export class LogImportError extends Error {
  constructor(public readonly line: number | undefined, message: string) { super(message); }
}
/** Format errors return a line number, never raw evidence or exception text. All-or-nothing. */
export function parseLog(bytes: Uint8Array, format: LogFormat, sourceHost?: string): LogObservation[] {
  if (!LOG_FORMATS.includes(format) || !bytes.length || bytes.length > MAX_LOG_BYTES) throw new LogImportError(undefined, "Choose a supported nonempty log up to 256 KiB.");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new LogImportError(undefined, "The log must be valid UTF-8."); }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw new LogImportError(undefined, "Binary content is not supported.");
  if (format === "nginx-combined" && !validHost(sourceHost)) throw new LogImportError(undefined, "Enter the hostname of the server that produced this access log.");
  const records: LogObservation[] = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index];
    if (!raw.trim()) continue;
    if (records.length >= MAX_LOG_RECORDS) throw new LogImportError(index + 1, "Split this log into batches of at most 100 events. No records were imported.");
    try {
      if (format === "breachbay-jsonl") {
        const row = JSON.parse(raw);
        if (!row || typeof row !== "object" || Array.isArray(row) || row.schema !== "breachbay.event.v1") throw new Error();
        // Credentials, URLs, query strings, user names and arbitrary messages never enter the derivative.
        const allowed = ["timestamp", "eventType", "host", "sourceHost", "destinationHost", "outcome", "protocol", "sourcePort", "destinationPort", "httpStatus", "httpMethod", "bytes"];
        const selected = Object.fromEntries(allowed.filter(k => row[k] !== undefined).map(k => [k, row[k]]));
        records.push(validateObservation({ ...selected, line: index + 1 }));
      } else {
        const match = raw.match(/^(\S+) \S+ \S+ \[(\d\d)\/(\w{3})\/(\d{4}):(\d\d):(\d\d):(\d\d) ([+-]\d{4})\] "([A-Z]+) [^"\r\n]* HTTP\/\d(?:\.\d)?" (\d{3}) (\d+|-) "[^"\r\n]*" "[^"\r\n]*"$/);
        if (!match) throw new Error();
        const [, address, day, month, year, hour, minute, second, offset, method, status, size] = match;
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const monthIndex = months.indexOf(month);
        if (monthIndex < 0) throw new Error();
        const time = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${day}T${hour}:${minute}:${second}${offset.slice(0, 3)}:${offset.slice(3)}`;
        const code = Number(status);
        records.push(validateObservation({ line: index + 1, timestamp: time, eventType: "http.request", host: sourceHost!, sourceHost: address, destinationHost: sourceHost!, outcome: code < 400 ? "success" : "failure", protocol: "http", httpStatus: code, httpMethod: method, ...(size === "-" ? {} : { bytes: Number(size) }) }));
      }
    } catch { throw new LogImportError(index + 1, "This line does not match the selected log format. No records were imported."); }
  }
  if (!records.length) throw new LogImportError(undefined, "The log has no events.");
  return records;
}
