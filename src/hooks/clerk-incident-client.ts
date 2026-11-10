"use client";
import {
  connectBackend,
  snapshotFromConnection,
  executeCommand,
  backendError,
  setIncidentRetentionPolicy,
  type DbConnection,
} from "@/lib/backend/client";
import type { IncidentClient } from "./use-incident";
import { evidenceForm, downloadResponse } from "./protected-transfers";
import { parseGraphReviewPreparation } from "./graph-review";
import { currentConnectionCallback } from "./connection-callback";
import { subscriptionFailureMessage } from "./subscription-failure";
import type { CommandResult, BackendSession } from "@/lib/contracts";
export type ClerkTokenSource = () => Promise<string | null>;
export function createClerkIncidentClient(
  getToken: ClerkTokenSource,
): IncidentClient {
  let connection: DbConnection | undefined;
  async function request<T>(
    url: string,
    body?: unknown,
  ): Promise<CommandResult<T>> {
    const token = await getToken();
    if (!token)
      return {
        ok: false,
        error: {
          code: "UNAUTHENTICATED",
          message: "Sign in to continue.",
          retryable: false,
        },
        correlationId: crypto.randomUUID(),
      };
    const response = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      cache: "no-store",
      credentials: "same-origin",
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.headers.get("content-type")?.includes("application/json"))
      return {
        ok: false,
        error: {
          code: "DEPENDENCY_UNAVAILABLE",
          message: "Server did not return a confirmed result.",
          retryable: true,
        },
        correlationId: crypto.randomUUID(),
      };
    return await response.json();
  }
  function requireConnection() {
    if (!connection?.isActive) throw new Error("UNAUTHENTICATED");
    return connection;
  }
  return {
    readOperationalPreview: incidentId => request("/api/responses", { mode: "preview", incidentId }),
    registerOperationalTarget: c => request("/api/responses", { ...c, mode: "register" }),
    proposeOperationalResponse: c => request("/api/responses", { ...c, mode: "propose" }),
    executeOperationalResponse: c => request("/api/responses", { ...c, mode: "execute" }),
    approveOperationalResponse: c => executeCommand(requireConnection(), c, () => requireConnection().reducers.approveOperationalResponse(c)),
    retireOperationalTarget: c => executeCommand(requireConnection(), c, () => requireConnection().reducers.retireOperationalTarget(c)),
    withdrawOperationalResponse: c => executeCommand(requireConnection(), c, () => requireConnection().reducers.withdrawOperationalResponse(c)),
    previewEvidence: async (c) => {
      const token = await getToken();
      if (!token) throw new Error("Sign in again before reviewing the log.");
      const response = await fetch("/api/evidence/preview", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: evidenceForm(c), credentials: "same-origin", cache: "no-store" });
      if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("No confirmed preview was returned.");
      return response.json();
    },
    approveEvidenceForModel: (c) => executeCommand(requireConnection(), c, () => requireConnection().reducers.approveEvidenceForModel(c)),
    setIncidentRetentionPolicy: (command) => setIncidentRetentionPolicy(requireConnection(), command),
    session: () => request<BackendSession>("/api/auth/session"),
    uploadEvidence: async (c) => {
      const token = await getToken();
      if (!token) throw new Error("Sign in again before uploading.");
      const response = await fetch("/api/evidence/upload", {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
        body: evidenceForm(c), credentials: "same-origin", cache: "no-store",
      });
      if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Upload outcome unknown.");
      return response.json();
    },
    exportReport: async (c) => {
      const token = await getToken();
      if (!token) throw new Error("Sign in again before exporting.");
      const response = await fetch(`/api/incidents/${encodeURIComponent(c.incidentId)}/report`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: c.idempotencyKey, correlationId: c.correlationId }),
        credentials: "same-origin", cache: "no-store",
      });
      return downloadResponse(response, c.correlationId);
    },
    downloadOriginal: async (id) => {
      const token = await getToken();
      if (!token) throw new Error("Sign in again before downloading.");
      const response = await fetch(`/api/evidence/${encodeURIComponent(id)}/original`, {
        headers: { Authorization: `Bearer ${token}` }, credentials: "same-origin", cache: "no-store",
      });
      return downloadResponse(response, crypto.randomUUID());
    },
    subscribe(incidentId, onSnapshot, onConnection, onError) {
      let active = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let current: DbConnection | undefined;
      const pulse = () => {
        if (!active || !current?.isActive || document.visibilityState === "hidden") return;
        const snapshot = snapshotFromConnection(current, incidentId);
        const profile = [...current.db.myProfile.iter()][0];
        const member = snapshot?.memberships.find(m => m.active && m.userId === profile?.id);
        if (!member || member.role === "AI_SERVICE" || !member.capabilities.includes("COLLABORATE")) return;
        // Presence is ephemeral server state. A failed heartbeat is never a
        // local "online" signal; only scoped rows with unexpired leases render.
        void current.reducers.heartbeat({ incidentId }).catch(() => {});
      };
      const presenceTimer = setInterval(pulse, 20000);
      const publish = () => {
        if (!active || !current) return;
        const snapshot = snapshotFromConnection(current, incidentId);
        if (snapshot) onSnapshot(snapshot);
        else {
          onError("Incident is unavailable or your access was revoked.");
          onConnection("disconnected");
        }
      };
      const connect = async () => {
        if (!active) return;
        onConnection(current ? "reconnecting" : "connecting");
        try {
          const token = await getToken();
          if (!token) throw new Error("Sign in again to restore your session.");
          const endpoint = process.env.NEXT_PUBLIC_SPACETIMEDB_ENDPOINT;
          const database = process.env.NEXT_PUBLIC_SPACETIMEDB_DATABASE;
          if (!endpoint || !database)
            throw new Error("Spacetime connection is not configured.");
          let connected: DbConnection | undefined;
          const next = await connectBackend({
            endpoint,
            database,
            token,
            onChange: currentConnectionCallback(() => active, () => current, () => connected, publish),
            onDisconnect: () => {
              if (active && connected && current === connected) {
                onError("Subscription disconnected. Incident state cleared until access is confirmed again.");
                onConnection("reconnecting");
                clearTimeout(timer);
                timer = setTimeout(connect, 2000);
              }
            },
          });
          connected = next;
          if (!active) {
            next.disconnect();
            return;
          }
          const previous = current;
          current = next;
          connection = next;
          previous?.disconnect();
          publish();
          pulse();
          onConnection(
            snapshotFromConnection(next, incidentId) ? "live" : "disconnected",
          );
          // Refresh short-lived Clerk session JWTs; never reuse credentials from DB response.
          clearTimeout(timer);
          timer = setTimeout(connect, 40000);
        } catch (error) {
          if (active) {
            onConnection("disconnected");
            onError(subscriptionFailureMessage(error));
            timer = setTimeout(connect, 10000);
          }
        }
      };
      void connect();
      return () => {
        active = false;
        clearTimeout(timer);
        clearInterval(presenceTimer);
        current?.disconnect();
        if (connection === current) connection = undefined;
      };
    },
    readGraphEdgeReview: async (incidentId, edgeId) => {
      const correlationId = crypto.randomUUID();
      try {
        const json = await requireConnection().procedures.readGraphEdgeReview({ incidentId, edgeId });
        return { ok: true, data: parseGraphReviewPreparation(json, incidentId, edgeId), correlationId };
      } catch (error) { return { ok: false, error: backendError(error), correlationId }; }
    },
    reviewGraphEdge: (c) => {
      const conn = requireConnection();
      const { evidenceRefs, ...command } = c;
      return executeCommand(conn, c, () => conn.reducers.reviewGraphEdge({ ...command, evidenceRefsJson: JSON.stringify(evidenceRefs) }));
    },
    checkpointScenario: (c) => {
      const conn = requireConnection();
      return executeCommand(conn, c, () => conn.reducers.checkpointScenario(c));
    },
    restoreScenario: (c) => {
      const conn = requireConnection();
      return executeCommand(conn, c, () => conn.reducers.restoreScenario(c));
    },
    cancelInvestigation: (c) => {
      const conn = requireConnection();
      return executeCommand(conn, c, () => conn.reducers.cancelInvestigation(c));
    },
    readScenarioSnapshot: async (incidentId, snapshotId) => {
      const correlationId = crypto.randomUUID();
      try {
        const stateJson = await requireConnection().procedures.readScenarioSnapshot({incidentId,snapshotId});
        return {ok:true,data:{stateJson},correlationId};
      } catch(error) {return {ok:false,error:backendError(error),correlationId};}
    },
    transitionIncident: (c) => {
      const conn = requireConnection();
      return executeCommand(conn, c, () => conn.reducers.transitionIncident(c));
    },
    proposeAction: (c) => {
      const conn = requireConnection();
      return executeCommand(conn, c, () => conn.reducers.proposeAction(c));
    },
    acceptFinding: (c) => {
      const conn = requireConnection();
      return executeCommand(conn, c, () => conn.reducers.acceptFinding(c));
    },
    linkGraphEdge: (c) => {
      const conn = requireConnection();
      return executeCommand(conn, c, () => conn.reducers.linkGraphEdge(c));
    },
    acknowledge: (c) => {
      const conn = requireConnection();
      return executeCommand(conn, c, () => conn.reducers.acknowledge(c));
    },
    postMessage: (c) => {
      const conn = requireConnection();
      return executeCommand(conn, c, () => conn.reducers.postMessage(c));
    },
    approveAction: (c) => {
      const conn = requireConnection();
      return executeCommand(conn, c, () => conn.reducers.approveAction(c));
    },
    simulateAction: (c) => {
      const conn = requireConnection();
      return executeCommand(conn, c, () => conn.reducers.simulateAction(c));
    },
    executeSimulation: (c) => {
      const conn = requireConnection();
      return executeCommand(conn, c, () => conn.reducers.executeSimulation(c));
    },
    assignTask: (c) => {
      const conn = requireConnection();
      return executeCommand(conn, c, () => conn.reducers.assignTask(c));
    },
    inviteMember: (c) => {
      const conn = requireConnection();
      return executeCommand(conn, c, () => conn.reducers.inviteMember(c));
    },
    setMember: (c) => {
      const conn = requireConnection();
      return executeCommand(conn, c, () => conn.reducers.setMember(c));
    },
    startInvestigation: (c) =>
      request<{ id: string }>("/api/investigations", c),
  };
}
