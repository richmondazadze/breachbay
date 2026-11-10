import { schema, table, t } from "spacetimedb/server";
const id = () => t.string().primaryKey();
const scope = () => ({ id: id(), incidentId: t.string().index("btree") });
export const Action = t.object("ActionPayload", {
  type: t.string(),
  targetIds: t.array(t.string()),
});
export const SimAsset = t.object("SimAsset", {
  id: t.string(),
  name: t.string(),
  criticality: t.string(),
  state: t.string(),
  credentialEnabled: t.bool(),
});
export const SimEdge = t.object("SimEdge", {
  id: t.string(),
  from: t.string(),
  to: t.string(),
  type: t.string(),
  enabled: t.bool(),
  evidenceIds: t.array(t.string()),
  credentialId: t.option(t.string()),
});
export const Scenario = t.object("Scenario", {
  incidentId: t.string(),
  version: t.u32(),
  seed: t.string(),
  synthetic: t.bool(),
  assets: t.array(SimAsset),
  edges: t.array(SimEdge),
  compromisedAssetIds: t.array(t.string()),
  protectedAssetIds: t.array(t.string()),
});
export const Diff = t.object("SimulationDiff", {
  assetChanges: t.array(
    t.object("AssetChange", {
      assetId: t.string(),
      before: t.string(),
      after: t.string(),
    }),
  ),
  edgeChanges: t.array(
    t.object("EdgeChange", {
      edgeId: t.string(),
      before: t.bool(),
      after: t.bool(),
    }),
  ),
  disruptedServiceIds: t.array(t.string()),
  containedAssetIds: t.array(t.string()),
  unresolvedPaths: t.array(t.array(t.string())),
  containmentCoverage: t.f64(),
  warnings: t.array(t.string()),
});
export const EvidenceInput = {
  kind: t.string(),
  title: t.string(),
  source: t.string(),
  capturedAt: t.string(),
  sha256: t.string(),
  redactedSha256: t.string(),
  classification: t.string(),
  redactedContent: t.string(),
  modelApproved: t.bool(),
  assetIds: t.array(t.string()),
};
export const users = table(
  { name: "users" },
  {
    id: id(),
    identity: t.identity().unique(),
    subject: t.string().unique(),
    displayName: t.string(),
    status: t.string(),
    platformAdmin: t.bool(),
    service: t.bool(),
    revokedBefore: t.f64(),
  },
);
export const sessions = table(
  { name: "sessions" },
  {
    id: id(),
    identity: t.identity().index("btree"),
    userId: t.string().index("btree"),
    expiresAt: t.f64(),
    issuedAt: t.f64(),
    authenticatedAt: t.f64(),
  },
);
export const rateBuckets = table(
  { name: "rate_buckets" },
  { id: id(), window: t.f64(), count: t.u32() },
);
export const presenceExpiry = table(
  { name: "presence_expiry" },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    presenceId: t.string(),
    expiresAt: t.string(),
  },
);
export const readLeases = table(
  { name: "read_leases" },
  {
    id: id(),
    userId: t.string().index("btree"),
    sessionId: t.string().index("btree"),
    expiresAt: t.f64(),
    authenticatedAt: t.f64(),
    clerkSessionId: t.string(),
    originalIssuedAt: t.f64(),
  },
);
export const revokedSessions = table(
  { name: "revoked_sessions" },
  { id: id(), userId: t.string(), revokedAt: t.f64() },
);
export const leaseExpiry = table(
  { name: "lease_expiry" },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    leaseId: t.string(),
  },
);
export const sessionExpiry = table(
  { name: "session_expiry" },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    sessionId: t.string(),
  },
);
export const incidentMembers = table(
  {
    name: "incident_members",
    indexes: [
      {
        accessor: "byUserIncident",
        algorithm: "btree",
        columns: ["userId", "incidentId"],
      },
    ],
  },
  {
    ...scope(),
    userId: t.string().index("btree"),
    role: t.string(),
    active: t.bool(),
    joinedAt: t.string(),
  },
);
export const invitations = table(
  { name: "invitations" },
  {
    ...scope(),
    targetSubject: t.string().index("btree"),
    role: t.string(),
    createdBy: t.string(),
    expiresAt: t.f64(),
    accepted: t.bool(),
  },
);
export const incidents = table(
  { name: "incidents" },
  {
    ...scope(),
    title: t.string(),
    description: t.string(),
    severity: t.string(),
    status: t.string(),
    classification: t.string(),
    scenarioId: t.string(),
    scenarioVersion: t.u32(),
    version: t.u32(),
    ownerId: t.string(),
    createdAt: t.string(),
    updatedAt: t.string(),
  },
);
// New private table: existing deployed layouts and retained records remain unchanged.
export const incidentRetentionPolicies = table(
  { name: "incident_retention_policies" },
  {
    ...scope(),
    indefinite: t.bool(),
    minimumRetentionDays: t.u32(),
    hold: t.bool(),
    version: t.u32(),
    updatedBy: t.option(t.string()),
    updatedAt: t.option(t.string()),
  },
);
export const assets = table(
  { name: "assets" },
  {
    ...scope(),
    name: t.string(),
    type: t.string(),
    owner: t.string(),
    criticality: t.string(),
    state: t.string(),
    version: t.u32(),
    lastSeen: t.string(),
    riskLabels: t.array(t.string()),
  },
);
export const evidence = table(
  { name: "evidence" },
  { ...scope(), ...EvidenceInput, createdAt: t.string(), version: t.u32() },
);
export const evidenceStorage = table(
  { name: "evidence_storage" },
  { ...scope(), storageRef: t.string() },
);
export const operationalTargets = table({ name: "operational_targets" }, {
  ...scope(), connectorId: t.string(), assetId: t.string(), name: t.string(), owner: t.string(), criticality: t.string(), active: t.bool(),
  version: t.u32(), instanceId: t.string(), reviewedBy: t.string(), reviewedAt: t.string(),
});
export const operationalResponses = table({ name: "operational_responses" }, {
  ...scope(), targetId: t.string(), operation: t.string(), expectedTargetVersion: t.u32(), expectedStateVersion: t.u32(), instanceId: t.string(),
  payloadDigest: t.string(), previewJson: t.string(), evidenceIds: t.array(t.string()), rationale: t.string(), requestedBy: t.string(),
  status: t.string(), version: t.u32(), approvalBy: t.option(t.string()), approvalReason: t.option(t.string()), approvalExpiresAt: t.option(t.string()),
  executionId: t.option(t.string()), executionBy: t.option(t.string()), resultJson: t.option(t.string()), createdAt: t.string(), updatedAt: t.string(),
});
export const indicators = table(
  { name: "indicators" },
  {
    ...scope(),
    kind: t.string(),
    normalizedValue: t.string(),
    confidence: t.string(),
    evidenceIds: t.array(t.string()),
  },
);
export const graphEdges = table(
  { name: "graph_edges" },
  {
    ...scope(),
    fromId: t.string().index("btree"),
    toId: t.string().index("btree"),
    type: t.string(),
    sourceEvidenceIds: t.array(t.string()),
    assertedBy: t.string(),
    confidence: t.string(),
    verificationStatus: t.string(),
    createdAt: t.string(),
    enabled: t.bool(),
    credentialId: t.option(t.string()),
  },
);
export const investigationExpiry = table(
  { name: "investigation_expiry" },
  { scheduledId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt(), runId: t.string() },
);
export const idSequence = table({name:"id_sequence"},{id:t.string().primaryKey(),next:t.u64()});
export const graphReviews=table({name:"graph_reviews"},{...scope(),edgeId:t.string(),findingId:t.option(t.string()),decision:t.string(),expectedEdgeDigest:t.string(),evidenceRefsJson:t.string(),reviewedBy:t.string(),createdAt:t.string()});
export const investigations = table(
  { name: "investigations" },
  {
    ...scope(),
    objective: t.string(),
    status: t.string(),
    requestedBy: t.string(),
    provider: t.option(t.string()),
    model: t.option(t.string()),
    createdAt: t.string(),
    updatedAt: t.string(),
    planningJson:t.option(t.string()).default(undefined),
  },
);
export const toolRuns = table(
  { name: "tool_runs" },
  {
    ...scope(),
    investigationId: t.string().index("btree"),
    tool: t.string(),
    argumentsDigest: t.string(),
    toolCallId: t.option(t.string()).default(undefined),
    providerLatencyMs: t.option(t.f64()).default(undefined),
    resultJson: t.option(t.string()).default(undefined),
    citationsJson: t.option(t.string()).default(undefined),
    failureCode: t.option(t.string()).default(undefined),
    status: t.string(),
    durationMs: t.option(t.f64()),
    evidenceIds: t.array(t.string()),
    summary: t.option(t.string()),
    createdAt: t.string(),
  },
);
export const findings = table(
  { name: "findings" },
  {
    ...scope(),
    investigationId: t.string(),
    title: t.string(),
    summary: t.string(),
    evidenceIds: t.array(t.string()),
    assetIds: t.array(t.string()),
    confidence: t.string(),
    unknowns: t.array(t.string()),
    verificationStatus: t.string(),
    createdAt: t.string(),
    recommendedNextQueries: t.option(t.array(t.string())).default(undefined),
  },
);
export const proposals = table(
  { name: "proposals" },
  {
    ...scope(),
    investigationId: t.option(t.string()),
    requestedBy: t.string(),
    action: Action,
    rationale: t.string(),
    evidenceIds: t.array(t.string()),
    assumptions: t.array(t.string()),
    uncertainty: t.array(t.string()),
    status: t.string(),
    expectedVersion: t.u32(),
    version: t.u32(),
    payloadDigest: t.string(),
    simulationId: t.option(t.string()),
    createdAt: t.string(),
    updatedAt: t.string(),
    planningJson: t.option(t.string()).default(undefined),
  },
);
export const simScenarios = table(
  { name: "sim_scenarios" },
  { ...scope(), state: Scenario },
);
export const scenarioHistory = table({name:"scenario_history"},{
  ...scope(), scenarioVersion:t.u32(),parentVersion:t.option(t.u32()),operation:t.string(),
  stateJson:t.string(),stateDigest:t.string(),proposalId:t.option(t.string()),restoredFromId:t.option(t.string()),createdBy:t.string(),createdAt:t.string(),
});
export const simBranches = table(
  { name: "sim_branches" },
  {
    ...scope(),
    proposalId: t.string(),
    parentVersion: t.u32(),
    scenarioSeed: t.string(),
    payloadDigest: t.string(),
    diff: Diff,
    createdAt: t.string(),
  },
);
export const approvals = table(
  { name: "approvals" },
  {
    ...scope(),
    proposalId: t.string().index("btree"),
    approverId: t.string(),
    decision: t.string(),
    justification: t.string(),
    payloadDigest: t.string(),
    scenarioVersion: t.u32(),
    proposalVersion: t.u32(),
    createdAt: t.string(),
    expiresAt: t.string(),
  },
);
export const verifications = table(
  { name: "verifications" },
  {
    ...scope(),
    proposalId: t.string(),
    status: t.string(),
    expectedVersion: t.u32(),
    observedVersion: t.u32(),
    summary: t.string(),
    createdAt: t.string(),
  },
);
export const messages = table(
  { name: "messages" },
  { ...scope(), authorId: t.string(), text: t.string(), createdAt: t.string() },
);
export const tasks = table(
  { name: "tasks" },
  {
    ...scope(),
    title: t.string(),
    assigneeId: t.option(t.string()),
    state: t.string(),
    dueAt: t.option(t.string()),
    version: t.u32(),
    createdAt: t.string(),
  },
);
export const presence = table(
  { name: "presence" },
  {
    ...scope(),
    userId: t.string(),
    sessionId: t.string().index("btree"),
    lastSeen: t.string(),
    expiresAt: t.string(),
  },
);
export const acknowledgments = table(
  { name: "acknowledgments" },
  {
    ...scope(),
    userId: t.string(),
    objectId: t.string(),
    createdAt: t.string(),
  },
);
export const auditEvents = table(
  { name: "audit_events" },
  {
    ...scope(),
    actorId: t.string(),
    verb: t.string(),
    objectId: t.string(),
    correlationId: t.string(),
    createdAt: t.string(),
    previousHash: t.string(),
    hash: t.string(),
    detail: t.string(),
  },
);
export const auditHeads = table(
  { name: "audit_heads" },
  { id: id(), hash: t.string() },
);
export const incidentReports = table(
  { name: "incident_reports" },
  {
    ...scope(),
    version: t.u32(),
    createdBy: t.string(),
    createdAt: t.string(),
    summary: t.string(),
  },
);
export const commandReceipts = table(
  { name: "command_receipts" },
  {
    id: id(),
    userId: t.string().index("btree"),
    incidentId: t.string(),
    command: t.string(),
    requestDigest: t.string(),
    objectId: t.string(),
    auditEventId: t.string(),
    correlationId: t.string(),
  },
);
export const streamEvents = table(
  { name: "stream_events" },
  {
    ...scope(),
    runId: t.string(),
    type: t.string(),
    time: t.string(),
    provider: t.option(t.string()),
    model: t.option(t.string()),
    correlationId: t.string(),
    tool: t.option(t.string()),
    summary: t.option(t.string()),
    // Preserve deployed legacy column; never export its contents as trusted trace.
    payloadJson: t.option(t.string()).default(undefined),
    dataJson: t.option(t.string()).default(undefined),
  },
);
const db = schema(
  {
    users,
    idSequence,
    sessions,
    sessionExpiry,
    readLeases,
    leaseExpiry,
    revokedSessions,
    rateBuckets,
    presenceExpiry,
    incidentMembers,
    invitations,
    incidents,
    incidentRetentionPolicies,
    assets,
    evidence,
    evidenceStorage,
    operationalTargets,
    operationalResponses,
    indicators,
    graphEdges,
    graphReviews,
    investigations,
    investigationExpiry,
    toolRuns,
    findings,
    proposals,
    simScenarios,
    scenarioHistory,
    simBranches,
    approvals,
    verifications,
    messages,
    tasks,
    presence,
    acknowledgments,
    auditEvents,
    auditHeads,
    incidentReports,
    commandReceipts,
    streamEvents,
  },
  {
    env: {
      AUTH_VALIDATION_URL: t.string(),
      OIDC_ISSUER: t.string(),
      OIDC_AUDIENCE: t.string(),
      BOOTSTRAP_COMMANDER_SUBJECTS: t.string(),
      SERVICE_SUBJECTS: t.string().optional(),
      RESPONSE_SIGNING_KEY: t.string().optional(),
    },
  },
);
export default db;
