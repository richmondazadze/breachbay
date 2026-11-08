import "server-only";
import { requireScope } from "./endpoint";
import { actionStatusFromSnapshot } from "./action-status";
import { validatePlanning, type ResponsePlan } from "../ai/planning";
import { clerkClient } from "@clerk/nextjs/server";
import { configureInvestigationGateway } from "../ai/gateway";
import { AIError, providerConfig } from "../ai/nemotron";
import { sanitizeEvidence, type Finding as AIFinding } from "../ai/evidence";
import type {
  InvestigationEvent,
  InvestigationPorts,
} from "../ai/investigation";
import { authenticatedBackend, backendConfig } from "./server";
import { enforceOrigin, AuthError } from "./oidc";
import {
  connectBackend,
  executeCommand,
  snapshotFromConnection,
} from "./client";
import type { Scenario } from "../simulation/types";
import { backendError } from "./client";
import { toolTrace, traceEvidenceIds, safeTraceJson, runDeadlineReached } from "./investigation-trace";
import { assertServiceSession } from "./service-session-operator";
import { ERROR_CODES } from "../contracts";
import { completedRunResult } from "./investigation-recovery";
const abortSignals = new WeakMap<InvestigationPorts,AbortSignal>();
export function getInvestigationAbortSignal(ports:InvestigationPorts){return abortSignals.get(ports);}
const canonicalRunIds = new WeakMap<InvestigationPorts, string>();
const recoveredResults = new WeakMap<InvestigationPorts, {runId:string;findings:AIFinding[];proposalId?:string;planning?:ResponsePlan}>();
export function getRecoveredInvestigationResult(ports: InvestigationPorts) { return recoveredResults.get(ports); }
export function getCanonicalRunId(ports: InvestigationPorts) {
  return canonicalRunIds.get(ports);
}
async function serviceToken() {
  if (process.env.AI_SERVICE_CLERK_SESSION_ID) {
    const client = await clerkClient();
    if (!process.env.AI_SERVICE_CLERK_USER_ID) throw new AuthError("DEPENDENCY_UNAVAILABLE", "Explicit service user is required");
    try { assertServiceSession(await client.sessions.getSession(process.env.AI_SERVICE_CLERK_SESSION_ID),process.env.AI_SERVICE_CLERK_USER_ID); }
    catch { throw new AuthError("DEPENDENCY_UNAVAILABLE", "Configured service session is inactive or belongs to another user"); }
    const token = await client.sessions.getToken(
      process.env.AI_SERVICE_CLERK_SESSION_ID,process.env.CLERK_JWT_TEMPLATE,120,
    );
    return token.jwt;
  }
  if (process.env.AI_SERVICE_ID_TOKEN) return process.env.AI_SERVICE_ID_TOKEN;
  throw new AuthError(
    "DEPENDENCY_UNAVAILABLE",
    "Incident-scoped AI service session is not configured",
  );
}
/** Install once from server instrumentation. Every factory is bound to verified Clerk identity. */
export function installInvestigationGateway() {
  configureInvestigationGateway(async (request, command) => {
    enforceOrigin(request);
    const authenticated = await authenticatedBackend(request);
    let conn = authenticated.conn;
    const session = authenticated.session;
    const controller = new AbortController();
    let servicing = false;
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const close = () => {
      if (!closed) {
        closed = true;
        controller.abort();
        if (timer) clearTimeout(timer);
        request.signal.removeEventListener("abort", close);
        conn.disconnect();
      }
    };
    request.signal.addEventListener("abort", close, { once: true });
    try {
      if (request.signal.aborted) throw new AuthError("DEPENDENCY_UNAVAILABLE", "Investigation request cancelled");
      const snapshot = snapshotFromConnection(conn, command.incidentId);
      const member = snapshot?.memberships.find(
        (m) => m.active && m.userId === session.user.id,
      );
      if (!snapshot || !member?.capabilities.includes("INVESTIGATE"))
        throw new AuthError(
          "FORBIDDEN",
          "Incident investigation permission denied",
        );
      const started = await executeCommand(conn, command, () =>
        conn.reducers.startInvestigation(command),
      );
      if (!started.ok)
        throw new AuthError(
          started.error.code === "FORBIDDEN"
            ? "FORBIDDEN"
            : "DEPENDENCY_UNAVAILABLE",
          started.error.message,
        );
      const runId = started.data.id;
      const originalRun = [...conn.db.scopedInvestigations.iter()].find(r => r.id === runId);
      if (originalRun?.status === "COMPLETED") {
        const deny = async (): Promise<never> => { throw new AuthError("FORBIDDEN", "Completed run is read-only; consume recovered result"); };
        const ports: InvestigationPorts = {loadContext:deny,persistEvent:deny,submitProposal:deny};
        canonicalRunIds.set(ports,runId);
        recoveredResults.set(ports,completedRunResult(snapshot!,runId)!);
        close(); return {session,ports};
      }
      if (!originalRun || originalRun.status !== "QUEUED" || runDeadlineReached(originalRun.createdAt,Date.now())) {
        if (originalRun && runDeadlineReached(originalRun.createdAt,Date.now()) && ["QUEUED","RUNNING"].includes(originalRun.status))
          await conn.reducers.reconcileInvestigation({...command, idempotencyKey:`reconcile:${runId}`, runId});
        throw new AuthError("DEPENDENCY_UNAVAILABLE", `Investigation ${runId} is ${originalRun?.status ?? "unavailable"}; inspect canonical state before retrying`);
      }
      providerConfig();
      const aiToken = await serviceToken();
      authenticated.conn.disconnect();
      conn = await connectBackend({ ...backendConfig(), token: aiToken, onDisconnect:close, onChange:()=>{
        if(servicing){const current=[...conn.db.scopedInvestigations.iter()].find(r=>r.id===runId);if(!current || current.status==="CANCELLED" || current.status==="FAILED")close();}
      } });
      if (closed || request.signal.aborted) { conn.disconnect(); throw new AuthError("DEPENDENCY_UNAVAILABLE", "Investigation request cancelled"); }
      const serviceSnapshot = snapshotFromConnection(conn, command.incidentId);
      const serviceProfile = [...conn.db.myProfile.iter()][0];
      if (
        !serviceSnapshot?.memberships.some(
          (m) =>
            m.active &&
            m.userId === serviceProfile?.id &&
            m.role === "AI_SERVICE",
        )
      )
        throw new AuthError(
          "FORBIDDEN",
          "AI service requires explicit incident grant",
        );
      const current = [...conn.db.scopedInvestigations.iter()].find(
        (r) => r.id === runId,
      );
      if (!current || current.status !== "QUEUED")
        throw new AuthError(
          "FORBIDDEN",
          "Investigation already claimed or completed",
        );
      servicing = true;
      // The first run_started reducer atomically claims QUEUED. Concurrent retries cannot duplicate runs.
      const eventMeta = (eventId: string) => ({
        idempotencyKey: `event:${runId}:${eventId}`.slice(0, 128),
        correlationId: command.correlationId,
      });
      const mapped = new Map<string, string>();
      const modelEvidence = new Map<string, {evidenceId:string;version:number;sha256:string}>();
      const citationPacket = (ids: string[]) => ids.map(id => {
        const citation = modelEvidence.get(id);
        if (!citation) throw new AIError("INVALID_MODEL_OUTPUT", "Citation not supplied in approved model context");
        const current = [...conn.db.scopedEvidence.iter()].find(e=>e.id===id && e.incidentId===command.incidentId && e.modelApproved && e.classification==="SYNTHETIC");
        if (!current || current.version!==citation.version) throw new AIError("INVALID_MODEL_OUTPUT", "Citation unavailable or changed");
        return citation;
      });
      timer = setTimeout(
        close,
        120000,
      );
      const ports: InvestigationPorts = {
        async loadContext(incidentId) {
          if (incidentId !== command.incidentId)
            throw new AIError("FORBIDDEN", "Incident scope mismatch");
          const state = [...conn.db.scopedScenarios.iter()].find(
            (s) => s.incidentId === incidentId,
          )?.state;
          if (!state)
            throw new AIError("FORBIDDEN", "Synthetic scenario unavailable");
          const context = snapshotFromConnection(conn, incidentId);
          if (!context) throw new AIError("FORBIDDEN", "Membership revoked");
          return {
            incidentId,
            summary: sanitizeEvidence({
              id: incidentId,
              incidentId,
              version: context.incident.version,
              source: "Incident summary",
              capturedAt: context.incident.createdAt,
              synthetic: true,
              fields: {
                description: `${context.incident.title}: ${context.incident.description}`,
              },
            }).excerpt,
            scenario: state as Scenario,
            evidence: context.evidence
              .filter(
                (e) => e.modelApproved && e.classification === "SYNTHETIC",
              )
              .map((e) => {
                let fields: Record<string, unknown>;
                try {
                  const parsed = JSON.parse(e.redactedContent);
                  fields =
                    parsed &&
                    typeof parsed === "object" &&
                    !Array.isArray(parsed)
                      ? parsed
                      : { description: e.redactedContent };
                } catch {
                  fields = { description: e.redactedContent };
                }
                const sanitized = sanitizeEvidence({
                  id: e.id,
                  incidentId,
                  version: e.version,
                  source: e.source,
                  capturedAt: e.capturedAt,
                  synthetic: true,
                  fields,
                });
                modelEvidence.set(e.id,{evidenceId:e.id,version:e.version,sha256:sanitized.sha256});
                return sanitized;
              }),
          };
        },
        async persistEvent(event: InvestigationEvent) {
          if (event.incidentId !== command.incidentId)
            throw new AIError("FORBIDDEN", "Event scope mismatch");
          const m = eventMeta(event.eventId);
          const tool =
            typeof event.data.tool === "string" ? event.data.tool : undefined;
          try {
            // Bounded/redacted trace derivatives are historical observations, never trusted context.
            if (event.type === "finding") {
              const finding = event.data.finding as AIFinding;
              const citations = citationPacket(finding.evidenceIds);
              const supplied = event.data.citations;
              if (JSON.stringify(supplied) !== JSON.stringify(citations)) throw new AIError("INVALID_MODEL_OUTPUT", "Finding citation version/hash mismatch");
            }
            if (
              event.type === "tool_completed" ||
              event.type === "tool_failed"
            ) {
              const result = event.data.result;
              const evidenceIds = traceEvidenceIds(result);
              let trace: ReturnType<typeof toolTrace>;
              try { trace = toolTrace(event.data); }
              catch { throw new AIError("INVALID_MODEL_OUTPUT", "Invalid tool trace"); }
              const citations = citationPacket(evidenceIds);

              await conn.reducers.recordToolRun({
                ...m,
                idempotencyKey: `tool:${runId}:${event.eventId}`.slice(0, 128),
                incidentId: command.incidentId,
                runId,
                tool: tool ?? "unknown",
                ...trace,
                citationsJson: safeTraceJson(citations),
                status:
                  event.type === "tool_completed" ? "COMPLETED" : "FAILED",
                durationMs:
                  typeof event.data.durationMs === "number"
                    ? event.data.durationMs
                    : undefined,
                evidenceIds,
                summary:
                  event.type === "tool_failed"
                    ? `Tool failed: ${String(event.data.code ?? "INVALID_MODEL_OUTPUT")}`
                    : "Validated scoped tool result",
              });
            }
            if (event.type === "finding") {
              const finding = event.data.finding as AIFinding;
              const saved = await executeCommand(
                conn,
                {
                  ...m,
                  idempotencyKey: `finding:${runId}:${event.eventId}`.slice(
                    0,
                    128,
                  ),
                },
                () =>
                  conn.reducers.recordFinding({
                    ...m,
                    idempotencyKey: `finding:${runId}:${event.eventId}`.slice(
                      0,
                      128,
                    ),
                    incidentId: command.incidentId,
                    runId,
                    title: finding.summary.slice(0, 160),
                    summary: finding.summary,
                    evidenceIds: finding.evidenceIds,
                    assetIds: [],
                    confidence: finding.confidence,
                    unknowns: finding.unknowns,
                    recommendedNextQueries:finding.recommendedNextQueries,
                  }),
              );
              if (!saved.ok)
                throw new AIError("INVALID_MODEL_OUTPUT", saved.error.message);
              mapped.set(event.eventId, saved.data.id);
            }
            await conn.reducers.recordInvestigationEvent({
              ...m,
              incidentId: command.incidentId,
              runId,
              type: event.type,
              provider: event.provider,
              model: event.model,
              tool,
              dataJson: safeTraceJson({...event.data,
                ...(event.type === "finding" ? {findingId:mapped.get(event.eventId)} : {}),
                ...(event.type === "run_completed" && Array.isArray(event.data.distinctTools) ? {distinctToolsCount:event.data.distinctTools.length} : {}),
                ...(typeof event.data.code === "string" ? {error:{code:ERROR_CODES.includes(event.data.code as never) ? event.data.code : "INVALID_MODEL_OUTPUT",message:"Investigation operation failed; inspect scoped trace",retryable:["MODEL_UNAVAILABLE","DEPENDENCY_UNAVAILABLE","RATE_LIMITED"].includes(event.data.code)}} : {}),
              }),
              summary:
                typeof event.data.code === "string"
                  ? event.data.code
                  : event.type === "finding"
                    ? mapped.get(event.eventId)
                    : event.type === "proposal"
                      ? String(event.data.proposalId)
                      : undefined,
            });
          } catch (error) {
            if (error instanceof AIError) throw error;
            const denied = backendError(error);
            throw new AuthError(
              denied.code === "FORBIDDEN"
                ? "FORBIDDEN"
                : "DEPENDENCY_UNAVAILABLE",
              denied.message,
            );
          } finally {
            if (["run_completed", "run_failed"].includes(event.type)) {
              if (timer) clearTimeout(timer);
              timer = undefined;
              close();
            }
          }
        },
        async getActionStatus(incidentId,actionId){
          if(closed || incidentId!==command.incidentId)throw new AIError("FORBIDDEN","Action scope unavailable");
          const context=requireScope(conn,incidentId,serviceProfile.id,"INVESTIGATE");
          try{return actionStatusFromSnapshot(context,incidentId,actionId);}catch{throw new AIError("FORBIDDEN","Action unavailable");}
        },
        async submitProposal(incidentId, action, expectedVersion, findings, planning) {
          if (incidentId !== command.incidentId)
            throw new AIError("FORBIDDEN", "Proposal scope mismatch");
          requireScope(conn,incidentId,serviceProfile.id,"PROPOSE");
          const scenario=[...conn.db.scopedScenarios.iter()].find(s=>s.incidentId===incidentId)?.state;
          if(!scenario || scenario.version!==expectedVersion)throw new AIError("INVALID_MODEL_OUTPUT","Scenario changed before planning persistence");
          const validatedPlan=planning===undefined?undefined:validatePlanning(planning,scenario as Scenario);
          const m = {
            idempotencyKey: `proposal:${runId}`,
            correlationId: command.correlationId,
          };
          const result = await executeCommand(conn, m, () =>
            conn.reducers.proposeAction({
              ...m,
              incidentId,
              investigationId: runId,
              action,
              rationale: findings
                .map((f) => f.summary)
                .join("\n")
                .slice(0, 4000),
              evidenceIds: [...new Set(findings.flatMap((f) => f.evidenceIds))],
              assumptions: validatedPlan?.assumptions ?? ["Synthetic scenario only"],
              uncertainty: validatedPlan?.uncertainty ?? findings.flatMap((f) => f.unknowns).slice(0, 30),
              planningJson: validatedPlan?JSON.stringify(validatedPlan):undefined,
              expectedVersion,
            }),
          );
          if (!result.ok)
            throw new AIError(
              result.error.code === "FORBIDDEN"
                ? "FORBIDDEN"
                : "INVALID_MODEL_OUTPUT",
              result.error.message,
            );
          return result.data.id;
        },
      };
      canonicalRunIds.set(ports, runId);
      abortSignals.set(ports,controller.signal);
      return { session, ports };
    } catch (error) {
      close();
      throw error;
    }
  });
}
