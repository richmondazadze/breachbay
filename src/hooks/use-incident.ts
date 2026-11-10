"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { createIncidentRequestLanes } from "./incident-request-lanes";
import type {
  IncidentSnapshot,
  BackendSession,
  CommandResult,
  PostMessageCommand,
  ApproveActionCommand,
  SimulateActionCommand,
  ExecuteSimulationCommand,
  StartInvestigationCommand,
  AssignTaskCommand,
  CommandMeta,
  IncidentRole,
  TransitionIncidentCommand,
  ProposeActionCommand,
  GraphEdgeType,
  Confidence,
  RestoreScenarioCommand,
  CancelInvestigationCommand,
  CommandError,
  GraphEdgeReviewPreparation,
  ReviewGraphEdgeCommand,
  SetIncidentRetentionPolicyCommand,
} from "@/lib/contracts";
export type ConnectionState =
  | "connecting"
  | "live"
  | "reconnecting"
  | "disconnected";
/** Backend supplies an authenticated adapter backed by scoped generated subscriptions.
 * A callback snapshot is authoritative. Mutations never update snapshots optimistically. */
export interface EvidenceUploadCommand extends CommandMeta {
  incidentId: string;
  file: File;
  title: string;
  capturedAt?: string;
  modelApproved: boolean;
  classification?: "SYNTHETIC" | "INTERNAL" | "RESTRICTED";
  logFormat?: "breachbay-jsonl" | "nginx-combined";
  source?: string;
  sourceHost?: string;
}
export interface LogPreview { eventCount: number; sha256: string; redactedSha256: string; redactedContent: string; capturedAt: string }
export interface ProtectedDownload { blob: Blob; filename: string }
export interface IncidentClient {
  readOperationalPreview?(incidentId: string): Promise<CommandResult<{ name: string; preview: import("@/lib/response/contract").ResponsePreview; proofJson: string; signature: string }>>;
  registerOperationalTarget?(command: CommandMeta & { incidentId: string; name: string; owner: string; criticality: string; reason: string; expectedVersion: number; proofJson: string; signature: string }): Promise<CommandResult<{ id: string }>>;
  retireOperationalTarget?(command: CommandMeta & { incidentId: string; targetId: string; expectedVersion: number; reason: string }): Promise<CommandResult<{ id: string }>>;
  withdrawOperationalResponse?(command: CommandMeta & { incidentId: string; responseId: string; expectedVersion: number; reason: string }): Promise<CommandResult<{ id: string }>>;
  proposeOperationalResponse?(command: CommandMeta & { incidentId: string; targetId: string; operation: import("@/lib/response/contract").RealOperation; expectedTargetVersion: number; proofJson: string; signature: string; evidenceIds: string[]; rationale: string }): Promise<CommandResult<{ id: string }>>;
  approveOperationalResponse?(command: CommandMeta & { incidentId: string; responseId: string; expectedVersion: number; decision: string; reason: string }): Promise<CommandResult<{ id: string }>>;
  executeOperationalResponse?(command: CommandMeta & { incidentId: string; responseId: string; expectedVersion: number }): Promise<CommandResult<{ id: string }>>;
  previewEvidence?(command: EvidenceUploadCommand): Promise<CommandResult<LogPreview>>;
  approveEvidenceForModel?(command: CommandMeta & { incidentId: string; evidenceId: string; expectedVersion: number; approved: boolean; reason: string }): Promise<CommandResult<{ id: string }>>;
  setIncidentRetentionPolicy(command: SetIncidentRetentionPolicyCommand): Promise<CommandResult<{ id: string }>>;
  readGraphEdgeReview(incidentId: string, edgeId: string): Promise<CommandResult<GraphEdgeReviewPreparation>>;
  reviewGraphEdge(command: ReviewGraphEdgeCommand): Promise<CommandResult<{ id: string }>>;
  checkpointScenario(command: CommandMeta & { incidentId: string }): Promise<CommandResult<{ id: string }>>;
  restoreScenario(command: RestoreScenarioCommand): Promise<CommandResult<{ id: string }>>;
  cancelInvestigation(command: CancelInvestigationCommand): Promise<CommandResult<{ id: string }>>;
  readScenarioSnapshot(incidentId: string, snapshotId: string): Promise<CommandResult<{ stateJson: string }>>;
  transitionIncident(command: TransitionIncidentCommand): Promise<CommandResult<{ id: string }>>;
  proposeAction(command: ProposeActionCommand): Promise<CommandResult<{ id: string }>>;
  acceptFinding(command: CommandMeta & { incidentId: string; findingId: string; reason: string }): Promise<CommandResult<{ id: string }>>;
  linkGraphEdge(command: CommandMeta & { incidentId: string; fromId: string; toId: string; type: GraphEdgeType; sourceEvidenceIds: string[]; confidence: Confidence }): Promise<CommandResult<{ id: string }>>;
  acknowledge(command: CommandMeta & { incidentId: string; objectId: string }): Promise<CommandResult<{ id: string }>>;
  uploadEvidence(command: EvidenceUploadCommand): Promise<CommandResult<{ id: string }>>;
  exportReport(command: CommandMeta & { incidentId: string }): Promise<CommandResult<ProtectedDownload>>;
  downloadOriginal(evidenceId: string): Promise<CommandResult<ProtectedDownload>>;
  session(): Promise<CommandResult<BackendSession>>;
  subscribe(
    incidentId: string,
    onSnapshot: (snapshot: IncidentSnapshot) => void,
    onConnection: (state: ConnectionState) => void,
    onError: (error: string) => void,
  ): () => void;
  postMessage(
    command: PostMessageCommand,
  ): Promise<CommandResult<{ id: string }>>;
  approveAction(
    command: ApproveActionCommand,
  ): Promise<CommandResult<{ id: string }>>;
  simulateAction(
    command: SimulateActionCommand,
  ): Promise<CommandResult<{ id: string }>>;
  executeSimulation(
    command: ExecuteSimulationCommand,
  ): Promise<CommandResult<{ id: string }>>;
  assignTask(
    command: AssignTaskCommand,
  ): Promise<CommandResult<{ id: string }>>;
  inviteMember(
    command: CommandMeta & {
      incidentId: string;
      targetSubject: string;
      role: IncidentRole;
    },
  ): Promise<CommandResult<{ id: string }>>;
  setMember(
    command: CommandMeta & {
      incidentId: string;
      userId: string;
      role: IncidentRole;
      active: boolean;
    },
  ): Promise<CommandResult<{ id: string }>>;
  startInvestigation(
    command: StartInvestigationCommand,
  ): Promise<CommandResult<{ id: string }>>;
}
export function useIncident(incidentId: string, client?: IncidentClient) {
  const [snapshot, setSnapshot] = useState<IncidentSnapshot | null>(null);
  const [session, setSession] = useState<BackendSession | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [authenticationError, setAuthenticationError] = useState<CommandError | null>(null);
  const [pending, setPending] = useState(false);
  const [investigationPending, setInvestigationPending] = useState(false);
  const [investigationError, setInvestigationError] = useState<string | null>(null);
  const [investigationAuthenticationError, setInvestigationAuthenticationError] = useState<CommandError | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const lanes = useRef(createIncidentRequestLanes());
  const live = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    live.current = false;
    lanes.current.reset();
    setPending(false);
    setInvestigationPending(false);
    setInvestigationError(null);
    setInvestigationAuthenticationError(null);
    setReceipt(null);
    setSnapshot(null);
    setSession(null);
    setError(null);
    setAuthenticationError(null);
    setConnection(client ? "connecting" : "disconnected");
    if (!client) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    const endSession = () => {
      generation.current++;
      live.current = false;
      lanes.current.reset();
      setPending(false);
      setInvestigationPending(false);
      setInvestigationError(null);
      setInvestigationAuthenticationError(null);
      setReceipt(null);
      active = false;
      unsubscribe?.();
      setSnapshot(null);
      setSession(null);
      setConnection("disconnected");
      setError("Session ended. Sign in again to reconnect.");
    };
    window.addEventListener("breachbay-session-ending", endSession);
    client
      .session()
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          if (result.error.code === "UNAUTHENTICATED") setAuthenticationError(result.error);
          setError(`${result.error.message} · ${result.correlationId}`);
          setConnection("disconnected");
          return;
        }
        setSession(result.data);
        unsubscribe = client.subscribe(
          incidentId,
          (next) => {
            if (!active || next.incident.id !== incidentId) return;
            setError(null);
            setSnapshot((previous) =>
              previous && previous.incident.version > next.incident.version
                ? previous
                : next,
            );
          },
          (state) => {
            if (active) {
              live.current = state === "live";
              setConnection(state);
              if (state === "disconnected") setSnapshot(null);
            }
          },
          (message) => {
            if (active) {
              live.current = false;
              setError(message);
              setSnapshot(null);
            }
          },
        );
      })
      .catch(() => {
        if (active) {
          setError("Unable to establish an authenticated connection.");
          setConnection("disconnected");
        }
      });
    return () => {
      generation.current++;
      live.current = false;
      lanes.current.reset();
      active = false;
      window.removeEventListener("breachbay-session-ending", endSession);
      unsubscribe?.();
    };
  }, [incidentId, client]);
  const command = useCallback(
    async (operation: () => Promise<CommandResult<{ id: string }>>) => {
      const ticket = lanes.current.begin("mutation", connection === "live" && live.current);
      if (!ticket) return false;
      const startedGeneration = generation.current;
      setPending(true);
      setError(null);
      setReceipt(null);
      try {
        const result = await operation();
        if (startedGeneration !== generation.current || !lanes.current.isCurrent(ticket)) return false;
        if (!result.ok) {
          if (result.error.code === "UNAUTHENTICATED") setAuthenticationError(result.error);
          setError(
            `${result.error.code}: ${result.error.message} · reference ${result.correlationId}`,
          );
          return false;
        }
        setReceipt(
          `Server accepted command · ${result.auditEventId ? `audit ${result.auditEventId}` : `reference ${result.correlationId}`} · awaiting subscribed state`,
        );
        return true;
      } catch {
        if (startedGeneration !== generation.current || !lanes.current.isCurrent(ticket)) return false;
        setError(
          "Command outcome is unknown. Reconnect and inspect server state before retrying.",
        );
        return false;
      } finally {
        if (lanes.current.finish(ticket)) setPending(false);
      }
    },
    [connection],
  );
  const investigationCommand = useCallback(
    async (operation: () => Promise<CommandResult<{ id: string }>>) => {
      const ticket = lanes.current.begin("investigation", connection === "live" && live.current);
      if (!ticket) return false;
      const startedGeneration = generation.current;
      setInvestigationPending(true);
      setInvestigationError(null);
      setInvestigationAuthenticationError(null);
      try {
        const result = await operation();
        if (startedGeneration !== generation.current || !lanes.current.isCurrent(ticket)) return false;
        if (!result.ok) {
          if (result.error.code === "UNAUTHENTICATED") setInvestigationAuthenticationError(result.error);
          setInvestigationError(`${result.error.code}: ${result.error.message} · reference ${result.correlationId}`);
          return false;
        }
        // Recorded runs/traces alone establish progress and terminal status.
        // Long-request completion never writes ordinary command feedback.
        return true;
      } catch {
        if (startedGeneration !== generation.current || !lanes.current.isCurrent(ticket)) return false;
        setInvestigationError("Investigation request outcome is unknown. Inspect server-recorded runs before retrying.");
        return false;
      } finally {
        if (lanes.current.finish(ticket)) setInvestigationPending(false);
      }
    },
    [connection],
  );
  const membership = snapshot?.memberships.find(
    (m) => m.active && m.userId === session?.user.id,
  );
  return {
    snapshot,
    session,
    connection,
    error,
    authenticationError,
    pending,
    investigationPending,
    investigationError,
    investigationAuthenticationError,
    receipt,
    command,
    investigationCommand,
    capabilities: membership?.capabilities ?? [],
  };
}
