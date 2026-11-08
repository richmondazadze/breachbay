/** Canonical BreachBay application contracts. IDs are opaque strings; times are ISO-8601 UTC. */
export type Id = string;
export type ISODateTime = string;
export const ROLES = [
  "COMMANDER",
  "INVESTIGATOR",
  "RESPONDER",
  "OBSERVER",
  "PLATFORM_ADMIN",
  "AI_SERVICE",
] as const;
export type Role = (typeof ROLES)[number];
export type IncidentRole = Exclude<Role, "PLATFORM_ADMIN">;
export type Capability =
  | "READ"
  | "MANAGE_INCIDENT"
  | "MANAGE_MEMBERS"
  | "ATTACH_EVIDENCE"
  | "INVESTIGATE"
  | "PROPOSE"
  | "SIMULATE"
  | "APPROVE"
  | "EXECUTE_SIMULATION"
  | "COLLABORATE"
  | "RESTORE_SIMULATION"
  | "EXPORT";
export const INCIDENT_STATES = [
  "NEW",
  "TRIAGED",
  "INVESTIGATING",
  "CONTAINMENT_PENDING",
  "CONTAINING",
  "RECOVERING",
  "RESOLVED",
  "ARCHIVED",
] as const;
export type IncidentStatus = (typeof INCIDENT_STATES)[number];
export const ACTION_STATES = [
  "DRAFT",
  "VALIDATED",
  "SIMULATED",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "EXECUTING",
  "VERIFIED_SUCCESS",
  "VERIFIED_PARTIAL",
  "VERIFIED_FAILED",
] as const;
export type ActionStatus = (typeof ACTION_STATES)[number];
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Classification = "SYNTHETIC" | "INTERNAL" | "RESTRICTED";
export type Confidence = "LOW" | "MEDIUM" | "HIGH";
export type VerificationStatus = "HYPOTHESIS" | "VERIFIED" | "DISPUTED";
export type ActionType =
  | "ISOLATE_SIMULATED_HOST"
  | "BLOCK_SIMULATED_ROUTE"
  | "RESET_SIMULATED_CREDENTIAL";
export type GraphEdgeType =
  | "DEPENDS_ON"
  | "COMMUNICATES_WITH"
  | "OBSERVED_ON"
  | "INDICATES"
  | "AFFECTS"
  | "SUPPORTED_BY"
  | "TARGETS"
  | "MITIGATES";
export interface User {
  id: Id;
  displayName: string;
  status: "ACTIVE" | "DISABLED";
  platformAdmin: boolean;
}
export interface Membership {
  id: Id;
  incidentId: Id;
  userId: Id;
  role: IncidentRole;
  active: boolean;
  joinedAt: ISODateTime;
  capabilities: Capability[];
}
export interface Incident {
  id: Id;
  incidentId: Id;
  title: string;
  description: string;
  severity: Severity;
  status: IncidentStatus;
  classification: Classification;
  scenarioId: string;
  scenarioVersion: number;
  version: number;
  ownerId: Id;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
/** Preservation settings only. No automatic cleanup or purge is implemented. */
export interface IncidentRetentionPolicy {
  id: Id;
  incidentId: Id;
  indefinite: boolean;
  minimumRetentionDays: number;
  hold: boolean;
  /** Zero denotes the conservative default for a legacy incident with no saved policy. */
  version: number;
  updatedBy?: Id;
  updatedAt?: ISODateTime;
}
export interface Asset {
  id: Id;
  incidentId: Id;
  name: string;
  type: "HOST" | "SERVICE" | "DATABASE" | "GATEWAY" | "IDENTITY";
  owner: string;
  criticality: Severity;
  state: "HEALTHY" | "COMPROMISED" | "ISOLATED" | "DEGRADED" | "OFFLINE";
  version: number;
  lastSeen: ISODateTime;
  riskLabels: string[];
}
/** Restricted object keys are deliberately excluded from client contracts. */
export interface Evidence {
  id: Id;
  incidentId: Id;
  kind: "LOG" | "ALERT" | "SCREENSHOT" | "REPORT";
  title: string;
  source: string;
  capturedAt: ISODateTime;
  createdAt: ISODateTime;
  sha256: string;
  redactedSha256: string;
  classification: Classification;
  redactedContent: string;
  modelApproved: boolean;
  assetIds: Id[];
  version: number;
}
export type EvidenceMetadata = Evidence;
export interface Indicator {
  id: Id;
  incidentId: Id;
  kind: "IP" | "HASH" | "DOMAIN" | "BEHAVIOR";
  normalizedValue: string;
  confidence: Confidence;
  evidenceIds: Id[];
}
export interface GraphEdge {
  id: Id;
  incidentId: Id;
  fromId: Id;
  toId: Id;
  type: GraphEdgeType;
  sourceEvidenceIds: Id[];
  assertedBy: Id;
  confidence: Confidence;
  verificationStatus: VerificationStatus;
  createdAt: ISODateTime;
  enabled: boolean;
  credentialId?: Id;
}
export interface EvidenceVersionRef { evidenceId: Id; version: number; sha256: string; redactedSha256: string; }
export interface GraphEdgeReviewPreparation { incidentId: Id; edgeId: Id; expectedEdgeDigest: string; evidenceRefs: EvidenceVersionRef[]; }
export interface GraphEdgeReview {
  id: Id; incidentId: Id; edgeId: Id; findingId?: Id; decision: "VERIFIED" | "DISPUTED";
  expectedEdgeDigest: string; evidenceRefsJson: string; reviewedBy: Id; createdAt: ISODateTime;
}
export interface ReviewGraphEdgeCommand extends CommandMeta {
  incidentId: Id; edgeId: Id; findingId?: Id; decision: "VERIFIED" | "DISPUTED";
  expectedEdgeDigest: string; evidenceRefs: EvidenceVersionRef[]; reason: string;
}
export interface Investigation {
  id: Id;
  incidentId: Id;
  objective: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  requestedBy: Id;
  provider?: string;
  model?: string;
  planning?: ResponsePlan;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
export interface ToolRun {
  id: Id;
  incidentId: Id;
  investigationId: Id;
  tool: string;
  argumentsDigest: string;
  toolCallId?: string;
  providerLatencyMs?: number;
  resultJson?: string;
  citationsJson?: string;
  failureCode?: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  durationMs?: number;
  evidenceIds: Id[];
  summary?: string;
  createdAt: ISODateTime;
}
export interface Finding {
  id: Id;
  incidentId: Id;
  investigationId: Id;
  title: string;
  summary: string;
  evidenceIds: Id[];
  assetIds: Id[];
  confidence: Confidence;
  unknowns: string[];
  recommendedNextQueries?: string[];
  verificationStatus: VerificationStatus;
  createdAt: ISODateTime;
}
export interface ActionPayload {
  type: ActionType;
  targetIds: Id[];
  route?: { fromId: Id; toId: Id };
}
export interface ResponsePlan {
  assumptions: string[];
  uncertainty: string[];
  alternatives: { action: Pick<ActionPayload, "type" | "targetIds">; rationale: string; tradeoffs: string[]; expectedImpact?: { reachableAssetIds: string[]; disruptedServiceIds: string[]; unresolvedProtectedAssetIds: string[]; containmentCoverage: number } }[];
}
export interface ActionStatusRead {
  incidentId: Id; actionId: Id; status: ActionStatus; version: number; expectedVersion: number;
  verification?: { status: "VERIFIED_SUCCESS" | "VERIFIED_PARTIAL" | "VERIFIED_FAILED"; observedVersion: number; summary: string };
}
export interface Proposal {
  id: Id;
  incidentId: Id;
  investigationId?: Id;
  requestedBy: Id;
  action: ActionPayload;
  rationale: string;
  evidenceIds: Id[];
  assumptions: string[];
  uncertainty: string[];
  planning?: ResponsePlan;
  status: ActionStatus;
  expectedVersion: number;
  version: number;
  payloadDigest: string;
  simulationId?: Id;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
export interface AssetChange {
  assetId: Id;
  before: Asset["state"];
  after: Asset["state"];
}
export interface EdgeChange {
  edgeId: Id;
  before: boolean;
  after: boolean;
}
export interface SimulationDiff {
  assetChanges: AssetChange[];
  edgeChanges: EdgeChange[];
  disruptedServiceIds: Id[];
  containedAssetIds: Id[];
  unresolvedPaths: Id[][];
  containmentCoverage: number;
  warnings: string[];
}
export interface SimulationBranch {
  id: Id;
  incidentId: Id;
  proposalId: Id;
  parentVersion: number;
  scenarioSeed: string;
  payloadDigest: string;
  diff: SimulationDiff;
  createdAt: ISODateTime;
}
export interface Approval {
  id: Id;
  incidentId: Id;
  proposalId: Id;
  approverId: Id;
  decision: "APPROVE" | "REJECT";
  justification: string;
  payloadDigest: string;
  scenarioVersion: number;
  proposalVersion: number;
  createdAt: ISODateTime;
  expiresAt: ISODateTime;
}
export interface Verification {
  id: Id;
  incidentId: Id;
  proposalId: Id;
  status: "VERIFIED_SUCCESS" | "VERIFIED_PARTIAL" | "VERIFIED_FAILED";
  expectedVersion: number;
  observedVersion: number;
  summary: string;
  createdAt: ISODateTime;
}
export interface Message {
  id: Id;
  incidentId: Id;
  authorId: Id;
  text: string;
  createdAt: ISODateTime;
}
export interface Task {
  id: Id;
  incidentId: Id;
  title: string;
  assigneeId?: Id;
  state: "TODO" | "IN_PROGRESS" | "DONE";
  dueAt?: ISODateTime;
  version: number;
  createdAt: ISODateTime;
}
export interface Presence {
  id: Id;
  incidentId: Id;
  userId: Id;
  lastSeen: ISODateTime;
  expiresAt: ISODateTime;
}
export interface Acknowledgment {
  id: Id;
  incidentId: Id;
  userId: Id;
  objectId: Id;
  createdAt: ISODateTime;
}
export interface AuditEvent {
  id: Id;
  incidentId: Id;
  actorId: Id;
  verb: string;
  objectId: Id;
  correlationId: string;
  createdAt: ISODateTime;
  previousHash: string;
  hash: string;
  detail: string;
}
export interface IncidentReport {
  id: Id;
  incidentId: Id;
  version: number;
  createdBy: Id;
  createdAt: ISODateTime;
  summary: string;
}
export const ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "INCIDENT_NOT_FOUND",
  "INVALID_INPUT",
  "INVALID_TRANSITION",
  "VERSION_CONFLICT",
  "EVIDENCE_REDACTED",
  "INVALID_MODEL_OUTPUT",
  "MODEL_UNAVAILABLE",
  "SIMULATION_FAILED",
  "APPROVAL_EXPIRED",
  "RATE_LIMITED",
  "DEPENDENCY_UNAVAILABLE",
  "NOT_FOUND",
  "IDEMPOTENCY_CONFLICT",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
export interface CommandError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
}
export type CommandResult<T> =
  | { ok: true; data: T; correlationId: string; auditEventId?: Id }
  | { ok: false; error: CommandError; correlationId: string };
export interface CommandMeta {
  idempotencyKey: string;
  correlationId: string;
  expectedVersion?: number;
}
export interface SetIncidentRetentionPolicyCommand extends CommandMeta {
  incidentId: Id;
  indefinite: boolean;
  /** Integer from 1 through 3650, retained even when indefinite preservation is selected. */
  minimumRetentionDays: number;
  hold: boolean;
  /** The subscribed policy revision, independent of incident/scenario versions. */
  expectedVersion: number;
  reason: string;
}
export interface CreateIncidentCommand extends CommandMeta {
  title: string;
  description: string;
  severity: Severity;
  classification: Classification;
  scenarioId: string;
}
export interface TransitionIncidentCommand extends CommandMeta {
  incidentId: Id;
  status: IncidentStatus;
  reason: string;
  expectedVersion: number;
}
export interface AttachEvidenceCommand extends CommandMeta {
  incidentId: Id;
  evidence: Omit<Evidence, "id" | "incidentId" | "createdAt" | "version">;
  storageRef: string;
}
export interface ScenarioSnapshot {
  id: Id; incidentId: Id; scenarioVersion: number; parentVersion?: number;
  operation: "INITIAL" | "EXECUTION" | "RESTORE" | "CHECKPOINT";
  stateDigest: string; proposalId?: Id; restoredFromId?: Id;
  createdBy: Id; createdAt: ISODateTime;
}
export interface RestoreScenarioCommand extends CommandMeta { incidentId: Id; snapshotId: Id; reason: string; expectedVersion: number; }
export interface CancelInvestigationCommand extends CommandMeta { incidentId: Id; runId: Id; reason: string; }
export interface StartInvestigationCommand extends CommandMeta {
  incidentId: Id;
  objective: string;
}
export interface ProposeActionCommand extends CommandMeta {
  incidentId: Id;
  action: ActionPayload;
  rationale: string;
  evidenceIds: Id[];
  assumptions: string[];
  uncertainty: string[];
  investigationId?: Id;
  planning?: ResponsePlan;
  expectedVersion: number;
}
export interface SimulateActionCommand extends CommandMeta {
  incidentId: Id;
  proposalId: Id;
  expectedVersion: number;
}
export interface ApproveActionCommand extends CommandMeta {
  incidentId: Id;
  proposalId: Id;
  decision: Approval["decision"];
  justification: string;
  expectedVersion: number;
  proposalVersion: number;
}
export interface ExecuteSimulationCommand extends CommandMeta {
  incidentId: Id;
  proposalId: Id;
  expectedVersion: number;
}
export interface PostMessageCommand extends CommandMeta {
  incidentId: Id;
  text: string;
}
export interface AssignTaskCommand extends CommandMeta {
  incidentId: Id;
  taskId?: Id;
  title: string;
  assigneeId?: Id;
  state: Task["state"];
  expectedVersion?: number;
}
export interface IncidentSnapshot {
  incident: Incident;
  retentionPolicy?: IncidentRetentionPolicy;
  memberships: Membership[];
  assets: Asset[];
  evidence: Evidence[];
  indicators: Indicator[];
  edges: GraphEdge[];
  graphReviews?: GraphEdgeReview[];
  investigations: Investigation[];
  toolRuns: ToolRun[];
  streamEvents?: InvestigationStreamEvent[];
  scenarioHistory?: ScenarioSnapshot[];
  findings: Finding[];
  proposals: Proposal[];
  simulations: SimulationBranch[];
  approvals: Approval[];
  verifications: Verification[];
  messages: Message[];
  tasks: Task[];
  presence: Presence[];
  acknowledgments: Acknowledgment[];
  auditEvents: AuditEvent[];
  reports: IncidentReport[];
}
export type InvestigationEventType =
  | "run_started"
  | ProviderCallEventType
  | "tool_started"
  | "tool_completed"
  | "tool_failed"
  | "finding"
  | "proposal"
  | "run_completed"
  | "run_failed"
  | "run_cancelled";
export const PROVIDER_CALL_EVENT_TYPES = ["provider_call_started", "provider_call_completed", "provider_call_failed"] as const;
export type ProviderCallEventType = (typeof PROVIDER_CALL_EVENT_TYPES)[number];
/** Persisted in stream dataJson. Counts are omitted when the provider did not supply them. */
export interface ProviderCallEventData {
  providerCallId: string; // App-generated UUID, shared by start and terminal events.
  step: number; // Zero-based provider iteration, 0..7.
  mode: "tools" | "final_json";
  endpoint: string; // Normalized actual HTTPS URL; no credentials, query, or fragment.
  classification: Classification;
  usageSource: "reported" | "estimated" | "unavailable";
  outcome: "started" | "completed" | "failed";
  durationMs?: number; // Required for terminal events, 0..120000.
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  usageEstimate?: {
    promptTokensUpperBound: number;
    completionTokensUpperBound: number;
    totalTokensUpperBound: number;
    method: "UTF8_REQUEST_BYTES_PLUS_OVERHEAD";
    basis: "REQUEST_BUDGET_CEILING";
  }; // Separate request budget ceiling; never actual token consumption.
  monetaryCost: "UNKNOWN"; // No pricing estimate is available in this implementation.
  finishReason?: "stop" | "tool_calls" | "length" | "content_filter" | "function_call" | "unknown";
  code?: ErrorCode; // Required for failed calls; no raw provider error text.
}
export interface InvestigationStreamEvent {
  dataJson?: string;
  type: InvestigationEventType;
  runId: Id;
  incidentId: Id;
  eventId: Id;
  time: ISODateTime;
  provider?: string;
  model?: string;
  correlationId: string;
  tool?: string;
  toolRun?: ToolRun;
  finding?: Finding;
  proposal?: Proposal;
  error?: CommandError;
  summary?: string;
}
export interface BackendSession {
  user: User;
  expiresAt: ISODateTime;
  authenticatedAt: ISODateTime;
}
