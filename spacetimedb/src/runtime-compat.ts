/** Spacetime's deterministic V8 runtime omits structuredClone. Synthetic scenarios are JSON values. */
if (typeof globalThis.structuredClone !== "function") {
  globalThis.structuredClone = <T>(value: T): T =>
    JSON.parse(JSON.stringify(value)) as T;
}
