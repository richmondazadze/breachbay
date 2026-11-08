/** Shared transport: browser and server connect as the user's OIDC principal, never DB owner. */
import { DbConnection } from "./generated";
import { awaitConnection } from "./connection-start";
import { installCspSafeCodecs } from "./csp-codecs";
import type {
  IncidentSnapshot,
  CommandResult,
  CommandMeta,
  ErrorCode,
} from "../contracts";
import { ERROR_CODES } from "../contracts";
export { DbConnection, tables } from "./generated";
export interface BackendConnectionOptions {
  endpoint: string;
  database: string;
  token: string;
  onChange?: () => void;
  onDisconnect?: () => void;
}
export const SUBSCRIPTION_QUERIES = [
  "my_profile",
  "my_sessions",
  "my_invitations",
  "my_receipts",
  "scoped_incidents",
  "scoped_memberships",
  "scoped_profiles",
  "scoped_assets",
  "scoped_evidence",
  "scoped_indicators",
  "scoped_edges",
  "scoped_graph_reviews",
  "scoped_investigations",
  "scoped_tool_runs",
  "scoped_findings",
  "scoped_proposals",
  "scoped_scenarios",
  "scoped_scenario_history",
  "scoped_simulations",
  "scoped_approvals",
  "scoped_verifications",
  "scoped_messages",
  "scoped_tasks",
  "scoped_presence",
  "scoped_acknowledgments",
  "scoped_audit_events",
  "scoped_reports",
  "scoped_stream_events",
].map((name) => `SELECT * FROM ${name}`);
export async function connectBackend(
  options: BackendConnectionOptions,
): Promise<DbConnection> {
  if (!options.token) throw new Error("UNAUTHENTICATED");
  const url = new URL(options.endpoint);
  if (
    !["https:", "wss:"].includes(url.protocol) &&
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error("TLS endpoint required");
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  if(typeof window!=="undefined")installCspSafeCodecs();
  const conn=await awaitConnection<DbConnection>(({connected,failed})=>
    DbConnection.builder()
      .withUri(options.endpoint)
      .withDatabaseName(options.database)
      .withToken(options.token)
      .onConnect(connected)
      .onConnectError((_ctx,error)=>failed(error))
      .onDisconnect(()=>{
        clearTimeout(expiryTimer);
        failed(new Error("DEPENDENCY_UNAVAILABLE"));
        options.onDisconnect?.();
      })
      .build(),
  );
  try {
    const lease = Array.from(
      globalThis.crypto.getRandomValues(new Uint8Array(32)),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    const session = await conn.procedures.openReadSession({
      lease,
      token: options.token,
    });
    const queries = SUBSCRIPTION_QUERIES.map((query) =>
      query.endsWith("my_profile") || query.endsWith("my_sessions")
        ? query
        : `${query}('${lease}')`,
    );
    expiryTimer = setTimeout(
      () => conn.disconnect(),
      Math.max(0, session.expiresAt * 1000 - Date.now()),
    );
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("DEPENDENCY_UNAVAILABLE")),
        10000,
      );
      conn
        .subscriptionBuilder()
        .onApplied(() => {
          clearTimeout(timeout);
          resolve();
          options.onChange?.();
        })
        .onError((ctx) => {
          clearTimeout(timeout);
          reject(ctx.event ?? new Error("Subscription denied"));
        })
        .subscribe(queries);
    });
    if (options.onChange) {
      // View caches expose the same typed row lifecycle callbacks as tables.
      for (const view of Object.values(conn.db)) {
        view.onInsert(() => options.onChange?.());
        view.onDelete(() => options.onChange?.());
        view.onUpdate(() => options.onChange?.());
      }
    }
    return conn;
  } catch (error) {
    conn.disconnect();
    throw error;
  }
}
export function snapshotFromConnection(
  conn: DbConnection,
  incidentId: string,
): IncidentSnapshot | undefined {
  const incident = [...conn.db.scopedIncidents.iter()].find(
    (i) => i.id === incidentId,
  );
  if (!incident) return undefined;
  const scoped = <T extends { incidentId: string }>(rows: Iterable<T>) =>
    [...rows].filter((row) => row.incidentId === incidentId);
  // Wire strings are validated in module reducers. This adapter restores the canonical enum types.
  return {
    incident,
    memberships: scoped(conn.db.scopedMemberships.iter()),
    assets: scoped(conn.db.scopedAssets.iter()),
    evidence: scoped(conn.db.scopedEvidence.iter()),
    indicators: scoped(conn.db.scopedIndicators.iter()),
    edges: scoped(conn.db.scopedEdges.iter()),
    graphReviews: scoped(conn.db.scopedGraphReviews.iter()),
    investigations: scoped(conn.db.scopedInvestigations.iter()).map(({planningJson,...run})=>({...run,...(planningJson?{planning:JSON.parse(planningJson)}:{})})),
    toolRuns: scoped(conn.db.scopedToolRuns.iter()),
    streamEvents: scoped(conn.db.scopedStreamEvents.iter()).map(({id,payloadJson:_deprecated,...event})=>({...event,eventId:id})),
    findings: scoped(conn.db.scopedFindings.iter()),
    proposals: scoped(conn.db.scopedProposals.iter()).map(({planningJson,...proposal})=>({...proposal,...(planningJson?{planning:JSON.parse(planningJson)}:{})})),
    simulations: scoped(conn.db.scopedSimulations.iter()),
    scenarioHistory: scoped(conn.db.scopedScenarioHistory.iter()).sort((a,b)=>a.scenarioVersion-b.scenarioVersion),
    approvals: scoped(conn.db.scopedApprovals.iter()),
    verifications: scoped(conn.db.scopedVerifications.iter()),
    messages: scoped(conn.db.scopedMessages.iter()),
    tasks: scoped(conn.db.scopedTasks.iter()),
    presence: scoped(conn.db.scopedPresence.iter()).filter(
      (p) => Date.parse(p.expiresAt) > Date.now(),
    ),
    acknowledgments: scoped(conn.db.scopedAcknowledgments.iter()),
    auditEvents: scoped(conn.db.scopedAuditEvents.iter()),
    reports: scoped(conn.db.scopedReports.iter()),
  } as IncidentSnapshot;
}
export function backendError(error: unknown): {
  code: ErrorCode;
  message: string;
  retryable: boolean;
} {
  const raw = error instanceof Error ? error.message : String(error);
  try {
    const start = raw.indexOf("{");
    const parsed = JSON.parse(raw.slice(start));
    if (ERROR_CODES.includes(parsed.code))
      return {
        code: parsed.code,
        message: parsed.message,
        retryable: parsed.retryable === true,
      };
  } catch {}
  if (raw.includes("UNAUTHENTICATED"))
    return {
      code: "UNAUTHENTICATED",
      message: "Authentication required",
      retryable: false,
    };
  return {
    code: "DEPENDENCY_UNAVAILABLE",
    message: "Backend operation did not return a confirmed result",
    retryable: true,
  };
}
export async function executeCommand(
  conn: DbConnection,
  meta: CommandMeta,
  operation: () => Promise<void>,
): Promise<CommandResult<{ id: string }>> {
  try {
    const profile = [...conn.db.myProfile.iter()][0];
    if (!profile) throw new Error("UNAUTHENTICATED");
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        JSON.stringify([profile.id, meta.idempotencyKey]),
      ),
    );
    const receiptId = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    await operation();
    const deadline = Date.now() + 3000;
    let receipt;
    while (Date.now() < deadline) {
      receipt = [...conn.db.myReceipts.iter()].find((r) => r.id === receiptId);
      if (receipt) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    if (!receipt) throw new Error("Missing committed receipt");
    return {
      ok: true,
      data: { id: receipt.objectId },
      correlationId: meta.correlationId,
      auditEventId: receipt.auditEventId,
    };
  } catch (error) {
    return {
      ok: false,
      error: backendError(error),
      correlationId: meta.correlationId,
    };
  }
}
