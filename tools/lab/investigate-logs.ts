/** Actual hosted inference over actual captured, pseudonymized local logs. No application-state writes. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { parseLog } from "../../src/lib/evidence/parse-log";
import { logDerivative } from "../../src/lib/evidence/import-manifest";
import { investigateOperational, type OperationalContext } from "../../src/lib/ai/operational-investigation";
import type { InvestigationEvent, InvestigationPorts } from "../../src/lib/ai/investigation";
async function main() {
const input = process.env.BREACHBAY_TEST_LOG_PATH, output = process.env.BREACHBAY_LAB_REPORT_DIR;
if (!input || !output) throw new Error("Actual log input and private output paths required");
const bytes = await readFile(input), incidentId = "local-log-review";
const events = parseLog(bytes, "breachbay-jsonl"), derivative = logDerivative(incidentId, events);
const hash = createHash("sha256").update(derivative).digest("hex");
const evidence = { id: "ev_" + createHash("sha256").update(bytes).digest("hex"), incidentId, version: 1, source: "Approved event log", capturedAt: events[0].timestamp, excerpt: derivative, sha256: hash };
const hostIds = [...new Set(JSON.parse(derivative).events.flatMap((e: { host: string; sourceHost?: string; destinationHost?: string }) => [e.host, e.sourceHost, e.destinationHost].filter(Boolean)))] as string[];
const context: OperationalContext = { incidentId, classification: "INTERNAL", evidence: [evidence], graph: { version: 1, assets: hostIds.map(id => ({ id, type: "HOST", state: "UNKNOWN", lastSeen: events.at(-1)!.timestamp })), edges: [] } };
const trace: InvestigationEvent[] = [];
const ports: InvestigationPorts = { loadContext: async () => { throw new Error("No synthetic context"); }, loadOperationalContext: async () => context, persistEvent: async e => { trace.push(e); }, submitProposal: async () => { throw new Error("No response actions in observation-only diagnostic"); } };
await mkdir(resolve(output), { recursive: true, mode: 0o700 });
try {
  const result = await investigateOperational(incidentId, "Retrieve the approved log, inspect the observed graph and summarize event outcomes. Explain the repeated rejected login attempts and subsequent successful activity. Distinguish observations from unproven compromise, cite the retrieved evidence and recommend what a responder should inspect next.", ports);
  await writeFile(join(output, "result.json"), JSON.stringify({ ...result, proof: "Actual NVIDIA inference over actual runtime-captured log events; private diagnostic, not authenticated deployed E2E", originalSha256: createHash("sha256").update(bytes).digest("hex"), derivativeSha256: hash }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ status: "COMPLETED", provider: "NVIDIA", findings: result.findings.length, distinctTools: [...new Set(trace.filter(e => e.type === "tool_completed").map(e => e.data.tool))], proposals: 0, reportDirectory: resolve(output) }));
} finally { await writeFile(join(output, "trace.json"), JSON.stringify(trace, null, 2), { mode: 0o600 }); }
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Provider check failed"); process.exitCode = 1; });
