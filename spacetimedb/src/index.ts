import { canonicalPlanning, boundedNextQueries } from "./planning";
import { restoreScenario as previewRestore } from "../../src/lib/simulation/restore";
import { evidenceIndex, actionIndex, findingIndex, findingReviews, reportUnknowns, planningIndex } from "./report-index";
import { defaultRetentionPolicy, validateRetentionSettings } from "./retention";
import { isProviderCallEvent, providerCallData } from "./provider-call";
import { PROVIDER_CALL_EVENT_TYPES } from "../../src/lib/contracts";
import { verificationReassessment } from "./verification-reassessment";
import { bootstrapPolicy } from "./bootstrap-policy";
import "./runtime-compat";
import {
  SenderError,
  t,
  type InferSchema,
  type ReducerCtx,
  type ViewCtx,
} from "spacetimedb/server";
import { ScheduleAt } from "spacetimedb";
import db, * as tables from "./schema";
import { canonical, sha256 } from "./hash";
import { credentialCompromiseScenario } from "../../src/lib/simulation/scenario";
import {
  simulateResponse,
  verifyExecution,
} from "../../src/lib/simulation/engine";
import type { Scenario, SimAction } from "../../src/lib/simulation/types";
export default db;
type Ctx = ReducerCtx<InferSchema<typeof db>>;
type ReadCtx = Pick<ViewCtx<InferSchema<typeof db>>, "db" | "sender">;
const meta = { idempotencyKey: t.string(), correlationId: t.string() };
const scopedMeta = { ...meta, incidentId: t.string() };
const roles = [
  "COMMANDER",
  "INVESTIGATOR",
  "RESPONDER",
  "OBSERVER",
  "AI_SERVICE",
];
const grants: Record<string, string[]> = {
  COMMANDER: [
    "READ",
    "MANAGE_INCIDENT",
    "MANAGE_MEMBERS",
    "ATTACH_EVIDENCE",
    "INVESTIGATE",
    "PROPOSE",
    "SIMULATE",
    "APPROVE",
    "EXECUTE_SIMULATION",
    "COLLABORATE",
    "EXPORT",
    "RESTORE_SIMULATION",
  ],
  INVESTIGATOR: [
    "READ",
    "ATTACH_EVIDENCE",
    "INVESTIGATE",
    "PROPOSE",
    "SIMULATE",
    "COLLABORATE",
  ],
  RESPONDER: ["READ", "COLLABORATE"],
  OBSERVER: ["READ"],
  AI_SERVICE: ["READ", "INVESTIGATE", "PROPOSE"],
};
function fail(code: string, message: string): never {
  throw new SenderError(
    JSON.stringify({
      code,
      message,
      retryable: [
        "VERSION_CONFLICT",
        "DEPENDENCY_UNAVAILABLE",
        "RATE_LIMITED",
      ].includes(code),
    }),
  );
}
function text(value: string, label: string, max = 2000) {
  if (!value.trim() || value.length > max || /\u0000/.test(value))
    fail("INVALID_INPUT", `Invalid ${label}`);
}
function oneOf(value: string, allowed: readonly string[], label: string) {
  if (!allowed.includes(value)) fail("INVALID_INPUT", `Invalid ${label}`);
}
function uid(ctx: Ctx, prefix: string) {
  // SDK 2.14 RNG is seeded by timestamp, so rapid transactions can collide.
  // The private sequence increments transactionally; hash keeps public IDs opaque.
  const sequence = ctx.db.idSequence.id.find("global");
  const next = (sequence?.next ?? 0n) + 1n;
  if (sequence) ctx.db.idSequence.id.update({id:"global",next});
  else ctx.db.idSequence.insert({id:"global",next});
  return `${prefix}_${sha256(`${ctx.databaseIdentity.toHexString()}:${prefix}:${next}`)}`;
}
function iso(ctx: Ctx) {
  return new Date(
    Number(ctx.timestamp.microsSinceUnixEpoch / 1000n),
  ).toISOString();
}
function seconds(ctx: Ctx) {
  return Number(ctx.timestamp.microsSinceUnixEpoch) / 1e6;
}
function jwt(ctx: Ctx) {
  const token = ctx.senderAuth.jwt;
  if (
    !token ||
    token.issuer !== ctx.env.OIDC_ISSUER ||
    !token.audience.includes(ctx.env.OIDC_AUDIENCE)
  )
    fail("UNAUTHENTICATED", "Independent OIDC token required");
  const claims = token.fullPayload;
  if (
    typeof claims.exp !== "number" ||
    typeof claims.iat !== "number" ||
    typeof claims.sid !== "string"
  )
    fail("UNAUTHENTICATED", "Expired or invalid session");
  return token;
}
function user(ctx: Ctx, recent = false, allowNoLease = false) {
  const token = jwt(ctx);
  const row = ctx.db.users.identity.find(ctx.sender);
  if (
    !row ||
    row.status !== "ACTIVE" ||
    Boolean(ctx.db.revokedSessions.id.find(String(token.fullPayload.sid)))
  )
    fail("UNAUTHENTICATED", "Session is revoked or account inactive");
  if (!allowNoLease) {
    const lease = ctx.connectionId
      ? [
          ...ctx.db.readLeases.sessionId.filter(ctx.connectionId.toHexString()),
        ].find(
          (l) =>
            l.userId === row.id &&
            l.expiresAt > seconds(ctx) &&
            l.originalIssuedAt > row.revokedBefore &&
            !ctx.db.revokedSessions.id.find(l.clerkSessionId),
        )
      : undefined;
    if (!lease)
      fail("UNAUTHENTICATED", "Valid original OIDC read session required");
  }
  const activeLease = ctx.connectionId
    ? [
        ...ctx.db.readLeases.sessionId.filter(ctx.connectionId.toHexString()),
      ].find((l) => l.userId === row.id)
    : undefined;
  if (
    recent &&
    (!activeLease ||
      activeLease.authenticatedAt <= 0 ||
      seconds(ctx) - activeLease.authenticatedAt > 900)
  )
    fail("UNAUTHENTICATED", "Recent authentication required");
  return row;
}
function readUser(ctx: ReadCtx, lease?: string) {
  const row = ctx.db.users.identity.find(ctx.sender);
  if (!row || row.status !== "ACTIVE") return undefined;
  const active = lease
    ? (() => {
        const ticket = ctx.db.readLeases.id.find(sha256(lease));
        return (
          ticket?.userId === row.id &&
          ticket.originalIssuedAt > row.revokedBefore &&
          !ctx.db.revokedSessions.id.find(ticket.clerkSessionId)
        );
      })()
    : [...ctx.db.sessions.identity.filter(ctx.sender)].some(
        (s) => s.issuedAt > row.revokedBefore,
      );
  return active ? row : undefined;
}
function memberships(ctx: ReadCtx, lease?: string) {
  const actor = readUser(ctx, lease);
  return actor
    ? [...ctx.db.incidentMembers.userId.filter(actor.id)].filter(
        (m) => m.active,
      )
    : [];
}
function visibleIds(ctx: ReadCtx, lease?: string) {
  return new Set(memberships(ctx, lease).map((m) => m.incidentId));
}
function requireIncident(
  ctx: Ctx,
  incidentId: string,
  capability: string,
  recent = false,
) {
  const actor = user(ctx, recent);
  const member = [
    ...ctx.db.incidentMembers.byUserIncident.filter([actor.id, incidentId]),
  ].find((m) => m.active);
  if (!member || !grants[member.role]?.includes(capability))
    fail("FORBIDDEN", "Incident permission denied");
  const incident = ctx.db.incidents.id.find(incidentId);
  if (!incident) fail("INCIDENT_NOT_FOUND", "Incident unavailable");
  return { actor, member, incident };
}
function version(actual: number, expected: number) {
  if (actual !== expected)
    fail("VERSION_CONFLICT", "State changed; refresh and retry");
}
function scoped<T extends { incidentId: string }>(
  row: T | null,
  incidentId: string,
  label: string,
): T {
  if (!row || row.incidentId !== incidentId)
    fail("NOT_FOUND", `${label} unavailable`);
  return row;
}
function citations(
  ctx: Ctx,
  incidentId: string,
  evidenceIds: string[],
  approved = false,
) {
  if (
    evidenceIds.length > 100 ||
    new Set(evidenceIds).size !== evidenceIds.length
  )
    fail("INVALID_INPUT", "Invalid evidence references");
  for (const evidenceId of evidenceIds) {
    const item = scoped(
      ctx.db.evidence.id.find(evidenceId),
      incidentId,
      "Evidence",
    );
    if (approved && !item.modelApproved)
      fail("EVIDENCE_REDACTED", "Evidence not approved for model use");
  }
}
function audit(
  ctx: Ctx,
  actorId: string,
  incidentId: string,
  verb: string,
  objectId: string,
  correlationId: string,
  detail = "",
) {
  const head = ctx.db.auditHeads.id.find(incidentId);
  const event = {
    id: uid(ctx, "audit"),
    incidentId,
    actorId,
    verb,
    objectId,
    correlationId,
    createdAt: iso(ctx),
    previousHash: head?.hash ?? "",
    detail,
  };
  const hash = sha256(canonical(event));
  ctx.db.auditEvents.insert({ ...event, hash });
  if (head) ctx.db.auditHeads.id.update({ id: incidentId, hash });
  else ctx.db.auditHeads.insert({ id: incidentId, hash });
  return event.id;
}
function command<T extends { idempotencyKey: string; correlationId: string }>(
  ctx: Ctx,
  name: string,
  args: T,
  incidentId: string,
  capability: string | undefined,
  apply: (actor: ReturnType<typeof user>) => string,
  recent = false,
  auditDetail?: () => string,
) {
  text(args.idempotencyKey, "idempotency key", 128);
  text(args.correlationId, "correlation ID", 128);
  const actor = capability
    ? requireIncident(ctx, incidentId, capability, recent).actor
    : user(ctx, recent);
  const key = sha256(canonical([actor.id, args.idempotencyKey]));
  const { correlationId: requestCorrelation, ...requestArgs } = args;
  const requestDigest = sha256(canonical({ name, args: requestArgs }));
  const existing = ctx.db.commandReceipts.id.find(key);
  if (existing) {
    if (existing.command !== name || existing.requestDigest !== requestDigest)
      fail("IDEMPOTENCY_CONFLICT", "Key already used with different request");
    return;
  }
  const bucketId = sha256(canonical([actor.id, name]));
  const bucket = ctx.db.rateBuckets.id.find(bucketId);
  const window = Math.floor(seconds(ctx) / 60);
  const limit =
    name === "postMessage"
      ? 60
      : name === "startInvestigation"
        ? 5
        : name === "attachEvidence"
          ? 10
          : 120;
  const count = bucket?.window === window ? bucket.count : 0;
  if (count >= limit) fail("RATE_LIMITED", "Command rate limit exceeded");
  if (bucket)
    ctx.db.rateBuckets.id.update({ id: bucketId, window, count: count + 1 });
  else ctx.db.rateBuckets.insert({ id: bucketId, window, count: 1 });
  const objectId = apply(actor);
  const auditScope = name === "createIncident" ? objectId : incidentId;
  const auditEventId = audit(
    ctx,
    actor.id,
    auditScope,
    name,
    objectId,
    args.correlationId,
    auditDetail ? auditDetail() : "reason" in args && typeof args.reason === "string" ? args.reason : "",
  );
  ctx.db.commandReceipts.insert({
    id: key,
    userId: actor.id,
    incidentId: auditScope,
    command: name,
    requestDigest,
    objectId,
    auditEventId,
    correlationId: args.correlationId,
  });
}
export const onConnect = db.clientConnected((ctx) => {
  const token = jwt(ctx);
  let actor = ctx.db.users.identity.find(ctx.sender);
  let policy: ReturnType<typeof bootstrapPolicy>;
  try { policy = bootstrapPolicy(token.subject,ctx.env.BOOTSTRAP_COMMANDER_SUBJECTS,ctx.env.SERVICE_SUBJECTS ?? "",actor ?? undefined); }
  catch { fail("UNAUTHENTICATED", "Configured human/service identity conflict"); }
  if (!actor) {
    const service = policy.service;
    actor = ctx.db.users.insert({
      id: ctx.sender.toHexString(),
      identity: ctx.sender,
      subject: token.subject,
      displayName: service
        ? "Investigation service"
        : typeof token.fullPayload.name === "string"
          ? token.fullPayload.name.slice(0, 100)
          : "Responder",
      status: "ACTIVE",
      platformAdmin: false,
      service,
      revokedBefore: 0,
    });
  }
  if (
    actor.status !== "ACTIVE" ||
    Boolean(ctx.db.revokedSessions.id.find(String(token.fullPayload.sid)))
  )
    fail("UNAUTHENTICATED", "Revoked session");
  if (ctx.connectionId) {
    const sessionId = ctx.connectionId.toHexString();
    ctx.db.sessions.insert({
      id: sessionId,
      identity: ctx.sender,
      userId: actor.id,
      expiresAt: seconds(ctx) + 900,
      issuedAt: Number(token.fullPayload.iat),
      authenticatedAt:
        typeof token.fullPayload.auth_time === "number"
          ? token.fullPayload.auth_time
          : 0,
    });
    ctx.db.sessionExpiry.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(
        ctx.timestamp.microsSinceUnixEpoch + 900_000_000n,
      ),
      sessionId,
    });
  }
});
function removeSession(ctx: Ctx, sessionId: string) {
  ctx.db.sessions.id.delete(sessionId);
  for (const lease of ctx.db.readLeases.sessionId.filter(sessionId))
    ctx.db.readLeases.id.delete(lease.id);
  for (const p of ctx.db.presence.sessionId.filter(sessionId))
    ctx.db.presence.id.delete(p.id);
}
export const expireSession = db.reducer(
  { onSchedule: tables.sessionExpiry },
  { timer: tables.sessionExpiry.rowType },
  (ctx, { timer }) => {
    if (!ctx.senderAuth.isInternal) fail("FORBIDDEN", "Scheduler only");
    removeSession(ctx, timer.sessionId);
  },
);
export const expirePresence = db.reducer(
  { onSchedule: tables.presenceExpiry },
  { timer: tables.presenceExpiry.rowType },
  (ctx, { timer }) => {
    if (!ctx.senderAuth.isInternal) fail("FORBIDDEN", "Scheduler only");
    const row = ctx.db.presence.id.find(timer.presenceId);
    if (row?.expiresAt === timer.expiresAt) ctx.db.presence.id.delete(row.id);
  },
);
export const onDisconnect = db.clientDisconnected((ctx) => {
  if (ctx.connectionId) removeSession(ctx, ctx.connectionId.toHexString());
});
export const logout = db.reducer({ ...meta }, (ctx, args) => {
  command(ctx, "logout", args, "", undefined, (actor) => {
    const sessionId = String(ctx.senderAuth.jwt!.fullPayload.sid);
    if (!ctx.db.revokedSessions.id.find(sessionId))
      ctx.db.revokedSessions.insert({
        id: sessionId,
        userId: actor.id,
        revokedAt: seconds(ctx),
      });
    for (const lease of ctx.db.readLeases.userId.filter(actor.id))
      if (lease.clerkSessionId === sessionId)
        ctx.db.readLeases.id.delete(lease.id);
    return actor.id;
  });
});
export const createIncident = db.reducer(
  {
    ...meta,
    title: t.string(),
    description: t.string(),
    severity: t.string(),
    classification: t.string(),
    scenarioId: t.string(),
  },
  (ctx, args) =>
    command(
      ctx,
      "createIncident",
      args,
      "",
      undefined,
      (actor) => {
        if (
          actor.service ||
          (!actor.platformAdmin &&
            ![...ctx.db.incidentMembers.userId.filter(actor.id)].some(
              (m) => m.active && m.role === "COMMANDER",
            ))
        )
          fail(
            "FORBIDDEN",
            "Incident creation requires explicitly bootstrapped commander",
          );
        text(args.title, "title", 160);
        text(args.description, "description", 5000);
        oneOf(args.severity, ["LOW", "MEDIUM", "HIGH", "CRITICAL"], "severity");
        oneOf(
          args.classification,
          ["SYNTHETIC", "INTERNAL", "RESTRICTED"],
          "classification",
        );
        if (args.scenarioId !== "credential-compromise")
          fail("INVALID_INPUT", "Unknown synthetic scenario");
        const id = uid(ctx, "inc");
        const now = iso(ctx);
        ctx.db.incidents.insert({
          id,
          incidentId: id,
          title: args.title,
          description: args.description,
          severity: args.severity,
          status: "NEW",
          classification: args.classification,
          scenarioId: args.scenarioId,
          scenarioVersion: 1,
          version: 1,
          ownerId: actor.id,
          createdAt: now,
          updatedAt: now,
        });
        ctx.db.incidentMembers.insert({
          id: sha256(canonical([id, actor.id])),
          incidentId: id,
          userId: actor.id,
          role: "COMMANDER",
          active: true,
          joinedAt: now,
        });
        ctx.db.incidentRetentionPolicies.insert({ ...defaultRetentionPolicy(id), version: 1, updatedBy: actor.id, updatedAt: now });
        ctx.db.tasks.insert({
          id: uid(ctx, "task"),
          incidentId: id,
          title: "Triage synthetic credential compromise",
          assigneeId: actor.id,
          state: "TODO",
          dueAt: undefined,
          version: 1,
          createdAt: now,
        });
        const scenario = credentialCompromiseScenario(id);
        for (const a of scenario.assets) {
          a.id = `${id}:${a.id}`;
        }
        const prefix = (x: string) => `${id}:${x}`;
        scenario.compromisedAssetIds = scenario.compromisedAssetIds.map(prefix);
        scenario.protectedAssetIds = scenario.protectedAssetIds.map(prefix);
        for (const e of scenario.edges) {
          e.id = prefix(e.id);
          e.from = prefix(e.from);
          e.to = prefix(e.to);
          e.evidenceIds = e.evidenceIds.map(prefix);
          if (e.credentialId) e.credentialId = prefix(e.credentialId);
        }
        ctx.db.simScenarios.insert({
          id,
          incidentId: id,
          state: {
            ...scenario,
            edges: scenario.edges.map((e) => ({
              ...e,
              credentialId: e.credentialId,
            })),
          },
        });
        captureScenario(ctx,scenario,actor.id,"INITIAL");
        for (const a of scenario.assets)
          ctx.db.assets.insert({
            id: a.id,
            incidentId: id,
            name: a.name,
            type: a.id.endsWith("database")
              ? "DATABASE"
              : a.id.endsWith("portal")
                ? "SERVICE"
                : "HOST",
            owner: "Synthetic operations",
            criticality: a.criticality,
            state: scenario.compromisedAssetIds.includes(a.id)
              ? "COMPROMISED"
              : "HEALTHY",
            version: 1,
            lastSeen: now,
            riskLabels: ["SYNTHETIC"],
          });
        const synthetic: Record<string, string> = {
          "ev-login":
            "Synthetic login: workstation credential used from unexpected source 192.0.2.44",
          "ev-lateral":
            "Synthetic lateral movement: workstation authenticated to app-host",
          "ev-db": "Synthetic app-host connection toward critical database",
          "ev-alternate":
            "Synthetic alternate path: workstation -> jump-host -> database",
          "ev-inventory":
            "Synthetic inventory: customer-portal depends on app-host; app-host and backup-service depend on database",
        };
        for (const [suffix, content] of Object.entries(synthetic))
          ctx.db.evidence.insert({
            id: prefix(suffix),
            incidentId: id,
            kind: "LOG",
            title: content.split(":")[0] + " " + suffix,
            source: "Synthetic seed",
            capturedAt: now,
            sha256: sha256(content),
            redactedSha256: sha256(content),
            classification: "SYNTHETIC",
            redactedContent: content,
            modelApproved: true,
            assetIds: scenario.assets.map((a) => a.id),
            createdAt: now,
            version: 1,
          });
        for (const e of scenario.edges)
          ctx.db.graphEdges.insert({
            id: e.id,
            incidentId: id,
            fromId: e.from,
            toId: e.to,
            type: e.type,
            sourceEvidenceIds: e.evidenceIds,
            assertedBy: actor.id,
            confidence: "HIGH",
            verificationStatus: "VERIFIED",
            createdAt: now,
            enabled: e.enabled,
            credentialId: e.credentialId,
          });
        return id;
      },
      true,
    ),
);
const transitions: Record<string, string[]> = {
  NEW: ["TRIAGED"],
  TRIAGED: ["INVESTIGATING"],
  INVESTIGATING: ["CONTAINMENT_PENDING"],
  CONTAINMENT_PENDING: ["CONTAINING"],
  CONTAINING: ["RECOVERING"],
  RECOVERING: ["RESOLVED"],
  RESOLVED: ["ARCHIVED", "INVESTIGATING"],
  ARCHIVED: [],
};
export const transitionIncident = db.reducer(
  {
    ...scopedMeta,
    status: t.string(),
    reason: t.string(),
    expectedVersion: t.u32(),
  },
  (ctx, args) =>
    command(
      ctx,
      "transitionIncident",
      args,
      args.incidentId,
      "MANAGE_INCIDENT",
      () => {
        const inc = scoped(
          ctx.db.incidents.id.find(args.incidentId),
          args.incidentId,
          "Incident",
        );
        version(inc.version, args.expectedVersion);
        text(args.reason, "reason", 2000);
        if (!transitions[inc.status]?.includes(args.status))
          fail("INVALID_TRANSITION", "Illegal incident transition");
        ctx.db.incidents.id.update({
          ...inc,
          status: args.status,
          version: inc.version + 1,
          updatedAt: iso(ctx),
        });
        return inc.id;
      },
      true,
    ),
);
export const setIncidentRetentionPolicy = db.reducer(
  { ...scopedMeta, indefinite: t.bool(), minimumRetentionDays: t.u32(), hold: t.bool(), expectedVersion: t.u32(), reason: t.string() },
  (ctx, args) => {
    let detail = "";
    return command(ctx, "setIncidentRetentionPolicy", args, args.incidentId, "MANAGE_INCIDENT", actor => {
      if (actor.service) fail("FORBIDDEN", "Human commander required");
      text(args.reason, "retention policy reason", 1000);
      try { validateRetentionSettings(args); } catch { fail("INVALID_INPUT", "Retention days must be an integer from 1 through 3650"); }
      const saved = ctx.db.incidentRetentionPolicies.id.find(args.incidentId);
      const before = saved ?? defaultRetentionPolicy(args.incidentId);
      version(before.version, args.expectedVersion);
      const after = { ...before, indefinite: args.indefinite, minimumRetentionDays: args.minimumRetentionDays, hold: args.hold, version: before.version + 1, updatedBy: actor.id, updatedAt: iso(ctx) };
      if (saved) ctx.db.incidentRetentionPolicies.id.update(after);
      else ctx.db.incidentRetentionPolicies.insert(after);
      detail = canonical({ reason: args.reason, before, after, automaticDeletionImplemented: false });
      return after.id;
    }, true, () => detail);
  },
);
export const scopedRetentionPolicies = db.view(
  { name: "scoped_retention_policies", public: true }, { lease: t.string() }, t.array(tables.incidentRetentionPolicies.rowType),
  (ctx, { lease }) => {
    const ids = visibleIds(ctx, lease);
    return [...ctx.db.incidents.iter()].filter(i => ids.has(i.id)).map(i => ctx.db.incidentRetentionPolicies.id.find(i.id) ?? defaultRetentionPolicy(i.id));
  },
);
export const inviteMember = db.reducer(
  { ...scopedMeta, targetSubject: t.string(), role: t.string() },
  (ctx, args) =>
    command(
      ctx,
      "inviteMember",
      args,
      args.incidentId,
      "MANAGE_MEMBERS",
      (actor) => {
        text(args.targetSubject, "subject", 300);
        oneOf(args.role, roles, "role");
        const id = uid(ctx, "invite");
        ctx.db.invitations.insert({
          id,
          incidentId: args.incidentId,
          targetSubject: args.targetSubject,
          role: args.role,
          createdBy: actor.id,
          expiresAt: seconds(ctx) + 86400,
          accepted: false,
        });
        return id;
      },
      true,
    ),
);
export const acceptInvitation = db.reducer(
  { ...meta, invitationId: t.string() },
  (ctx, args) =>
    command(ctx, "acceptInvitation", args, "", undefined, (actor) => {
      const invite = ctx.db.invitations.id.find(args.invitationId);
      if (
        !invite ||
        invite.targetSubject !== actor.subject ||
        invite.accepted ||
        invite.expiresAt <= seconds(ctx)
      )
        fail("FORBIDDEN", "Invitation unavailable or expired");
      if (actor.service !== (invite.role === "AI_SERVICE"))
        fail("FORBIDDEN", "Service/human role mismatch");
      if (
        [
          ...ctx.db.incidentMembers.byUserIncident.filter([
            actor.id,
            invite.incidentId,
          ]),
        ].some((m) => m.active)
      )
        fail("INVALID_INPUT", "Already a member");
      const memberId = sha256(canonical([invite.incidentId, actor.id]));
      const previous = ctx.db.incidentMembers.id.find(memberId);
      const membership = {
        id: memberId,
        incidentId: invite.incidentId,
        userId: actor.id,
        role: invite.role,
        active: true,
        joinedAt: previous?.joinedAt ?? iso(ctx),
      };
      if (previous) ctx.db.incidentMembers.id.update(membership);
      else ctx.db.incidentMembers.insert(membership);
      ctx.db.invitations.id.update({ ...invite, accepted: true });
      audit(
        ctx,
        actor.id,
        invite.incidentId,
        "membershipAccepted",
        actor.id,
        args.correlationId,
      );
      return invite.id;
    }),
);
export const setMember = db.reducer(
  { ...scopedMeta, userId: t.string(), role: t.string(), active: t.bool() },
  (ctx, args) =>
    command(
      ctx,
      "setMember",
      args,
      args.incidentId,
      "MANAGE_MEMBERS",
      (actor) => {
        oneOf(args.role, roles, "role");
        const target = ctx.db.users.id.find(args.userId);
        if (
          !target ||
          target.status !== "ACTIVE" ||
          target.service !== (args.role === "AI_SERVICE")
        )
          fail("INVALID_INPUT", "Invalid member");
        const current = [
          ...ctx.db.incidentMembers.byUserIncident.filter([
            args.userId,
            args.incidentId,
          ]),
        ][0];
        if (
          current?.role === "COMMANDER" &&
          (!args.active || args.role !== "COMMANDER") &&
          [...ctx.db.incidentMembers.incidentId.filter(args.incidentId)].filter(
            (m) => m.active && m.role === "COMMANDER",
          ).length <= 1
        )
          fail("INVALID_INPUT", "Cannot remove final commander");
        if (current)
          ctx.db.incidentMembers.id.update({
            ...current,
            role: args.role,
            active: args.active,
          });
        else
          ctx.db.incidentMembers.insert({
            id: sha256(canonical([args.incidentId, args.userId])),
            incidentId: args.incidentId,
            userId: args.userId,
            role: args.role,
            active: args.active,
            joinedAt: iso(ctx),
          });
        return args.userId;
      },
      true,
    ),
);
export const postMessage = db.reducer(
  { ...scopedMeta, text: t.string() },
  (ctx, args) =>
    command(
      ctx,
      "postMessage",
      args,
      args.incidentId,
      "COLLABORATE",
      (actor) => {
        text(args.text, "message", 4000);
        const id = uid(ctx, "msg");
        ctx.db.messages.insert({
          id,
          incidentId: args.incidentId,
          authorId: actor.id,
          text: args.text,
          createdAt: iso(ctx),
        });
        return id;
      },
    ),
);
export const assignTask = db.reducer(
  {
    ...scopedMeta,
    taskId: t.option(t.string()),
    title: t.string(),
    assigneeId: t.option(t.string()),
    state: t.string(),
    expectedVersion: t.option(t.u32()),
  },
  (ctx, args) =>
    command(ctx, "assignTask", args, args.incidentId, "COLLABORATE", () => {
      text(args.title, "task title", 200);
      oneOf(args.state, ["TODO", "IN_PROGRESS", "DONE"], "task state");
      if (
        args.assigneeId &&
        ![
          ...ctx.db.incidentMembers.byUserIncident.filter([
            args.assigneeId,
            args.incidentId,
          ]),
        ].some((m) => m.active && m.role !== "AI_SERVICE")
      )
        fail("INVALID_INPUT", "Assignee not a human incident member");
      const existing = args.taskId
        ? scoped(ctx.db.tasks.id.find(args.taskId), args.incidentId, "Task")
        : null;
      if (existing) {
        if (args.expectedVersion === undefined)
          fail("VERSION_CONFLICT", "Task version required");
        version(existing.version, args.expectedVersion);
        ctx.db.tasks.id.update({
          ...existing,
          title: args.title,
          assigneeId: args.assigneeId,
          state: args.state,
          version: existing.version + 1,
        });
        return existing.id;
      }
      const id = uid(ctx, "task");
      ctx.db.tasks.insert({
        id,
        incidentId: args.incidentId,
        title: args.title,
        assigneeId: args.assigneeId,
        state: args.state,
        dueAt: undefined,
        version: 1,
        createdAt: iso(ctx),
      });
      return id;
    }),
);
export const heartbeat = db.reducer(
  { incidentId: t.string() },
  (ctx, { incidentId }) => {
    const { actor } = requireIncident(ctx, incidentId, "COLLABORATE");
    if (!ctx.connectionId) fail("UNAUTHENTICATED", "Connection required");
    const sessionId = ctx.connectionId.toHexString();
    const id = sha256(canonical([sessionId, incidentId]));
    const row = {
      id,
      incidentId,
      userId: actor.id,
      sessionId,
      lastSeen: iso(ctx),
      expiresAt: new Date((seconds(ctx) + 60) * 1000).toISOString(),
    };
    if (ctx.db.presence.id.find(id)) ctx.db.presence.id.update(row);
    else ctx.db.presence.insert(row);
    ctx.db.presenceExpiry.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(
        ctx.timestamp.microsSinceUnixEpoch + 60_000_000n,
      ),
      presenceId: id,
      expiresAt: row.expiresAt,
    });
  },
);
export const acknowledge = db.reducer(
  { ...scopedMeta, objectId: t.string() },
  (ctx, args) =>
    command(
      ctx,
      "acknowledge",
      args,
      args.incidentId,
      "COLLABORATE",
      (actor) => {
        const object =
          ctx.db.proposals.id.find(args.objectId) ??
          ctx.db.tasks.id.find(args.objectId) ??
          ctx.db.messages.id.find(args.objectId);
        scoped(object, args.incidentId, "Object");
        const id = sha256(
          canonical([actor.id, args.incidentId, args.objectId]),
        );
        if (!ctx.db.acknowledgments.id.find(id))
          ctx.db.acknowledgments.insert({
            id,
            incidentId: args.incidentId,
            userId: actor.id,
            objectId: args.objectId,
            createdAt: iso(ctx),
          });
        return id;
      },
    ),
);
export const attachEvidence = db.reducer(
  { ...scopedMeta, ...tables.EvidenceInput, storageRef: t.string() },
  (ctx, args) =>
    command(
      ctx,
      "attachEvidence",
      args,
      args.incidentId,
      "ATTACH_EVIDENCE",
      () => {
        oneOf(args.kind, ["LOG", "ALERT", "SCREENSHOT", "REPORT"], "kind");
        oneOf(
          args.classification,
          ["SYNTHETIC", "INTERNAL", "RESTRICTED"],
          "classification",
        );
        text(args.title, "title", 200);
        text(args.source, "source", 300);
        text(args.redactedContent, "redacted evidence", 32000);
        if (
          !/^\d{4}-\d\d-\d\dT/.test(args.capturedAt) ||
          !Number.isFinite(Date.parse(args.capturedAt))
        )
          fail("INVALID_INPUT", "Invalid capture time");
        if (
          !/^[a-f0-9]{64}$/.test(args.sha256) ||
          sha256(args.redactedContent) !== args.redactedSha256
        )
          fail("INVALID_INPUT", "Evidence integrity mismatch");
        if (args.modelApproved && args.classification !== "SYNTHETIC")
          fail(
            "EVIDENCE_REDACTED",
            "Only synthetic evidence approved for model use",
          );
        text(args.storageRef, "restricted storage key", 500);
        if (args.assetIds.length > 100)
          fail("INVALID_INPUT", "Too many assets");
        for (const assetId of args.assetIds)
          scoped(ctx.db.assets.id.find(assetId), args.incidentId, "Asset");
        const id = uid(ctx, "ev");
        const { idempotencyKey, correlationId, storageRef, ...item } = args;
        ctx.db.evidence.insert({
          ...item,
          id,
          createdAt: iso(ctx),
          version: 1,
        });
        ctx.db.evidenceStorage.insert({
          id,
          incidentId: args.incidentId,
          storageRef,
        });
        return id;
      },
    ),
);
function requireActiveRun(ctx: Ctx, run: {createdAt:string;requestedBy:string;incidentId:string}) {
  if (seconds(ctx) * 1000 >= Date.parse(run.createdAt) + 120000) fail("INVALID_TRANSITION", "Run deadline exceeded");
  const requester = ctx.db.users.id.find(run.requestedBy);
  const member = [...ctx.db.incidentMembers.byUserIncident.filter([run.requestedBy,run.incidentId])].find(m=>m.active);
  if (!requester || requester.status !== "ACTIVE" || !member || !grants[member.role]?.includes("INVESTIGATE")) fail("FORBIDDEN", "Investigation requester authority revoked");
}
function boundedTraceJson(value: string) {
  if (value.length > 60000) fail("INVALID_INPUT", "Trace too large");
  try { JSON.parse(value); } catch { fail("INVALID_INPUT", "Invalid trace JSON"); }
}
function reconcileRun(ctx: Ctx, runId: string) {
  const run = ctx.db.investigations.id.find(runId);
  if (!run || ["COMPLETED", "FAILED", "CANCELLED"].includes(run.status) || seconds(ctx) * 1000 < Date.parse(run.createdAt) + 120000) return;
  ctx.db.investigations.id.update({ ...run, status: "FAILED", updatedAt: iso(ctx) });
  for (const tool of ctx.db.toolRuns.investigationId.filter(runId)) if (tool.status === "RUNNING") ctx.db.toolRuns.id.update({ ...tool, status: "FAILED", failureCode: "RUN_DEADLINE_EXCEEDED" });
  ctx.db.streamEvents.insert({ id: uid(ctx, "event"), incidentId: run.incidentId, runId, type: "run_failed", time: iso(ctx), provider: run.provider, model: run.model, correlationId: `deadline:${runId}`, tool: undefined, summary: "RUN_DEADLINE_EXCEEDED", payloadJson: undefined, dataJson: JSON.stringify({ code: "RUN_DEADLINE_EXCEEDED", reconciled: true }) });
  audit(ctx, "system:run-deadline", run.incidentId, "investigationDeadline", runId, `deadline:${runId}`, "Abandoned investigation failed; no inference or success inferred");
}
export const expireInvestigation = db.reducer(
  { onSchedule: tables.investigationExpiry }, { timer: tables.investigationExpiry.rowType },
  (ctx, {timer}) => { if (!ctx.senderAuth.isInternal) fail("FORBIDDEN", "Scheduler only"); reconcileRun(ctx, timer.runId); },
);
export const reconcileInvestigation = db.reducer({ ...scopedMeta, runId: t.string() }, (ctx,args) => command(ctx,"reconcileInvestigation",args,args.incidentId,"INVESTIGATE",()=>{
  scoped(ctx.db.investigations.id.find(args.runId),args.incidentId,"Investigation"); reconcileRun(ctx,args.runId); return args.runId;
}));
export const cancelInvestigation = db.reducer({...scopedMeta,runId:t.string(),reason:t.string()},(ctx,args)=>command(ctx,"cancelInvestigation",args,args.incidentId,"INVESTIGATE",actor=>{
  if(actor.service)fail("FORBIDDEN","Human cancellation required");
  const run=scoped(ctx.db.investigations.id.find(args.runId),args.incidentId,"Investigation");
  const member=[...ctx.db.incidentMembers.byUserIncident.filter([actor.id,args.incidentId])].find(m=>m.active);
  if(run.requestedBy!==actor.id && member?.role!=="COMMANDER")fail("FORBIDDEN","Requester or commander cancellation required");
  text(args.reason,"cancellation reason",2000);
  if(!["QUEUED","RUNNING"].includes(run.status))fail("INVALID_TRANSITION","Run already terminal");
  ctx.db.investigations.id.update({...run,status:"CANCELLED",updatedAt:iso(ctx)});
  for(const tool of ctx.db.toolRuns.investigationId.filter(run.id))if(tool.status==="RUNNING")ctx.db.toolRuns.id.update({...tool,status:"FAILED",failureCode:"RUN_CANCELLED"});
  ctx.db.streamEvents.insert({id:uid(ctx,"event"),incidentId:args.incidentId,runId:run.id,type:"run_cancelled",time:iso(ctx),provider:run.provider,model:run.model,correlationId:args.correlationId,tool:undefined,summary:"RUN_CANCELLED",payloadJson:undefined,dataJson:JSON.stringify({code:"RUN_CANCELLED",actorId:actor.id})});
  return run.id;
}));
function captureScenario(ctx:Ctx,state:Scenario,actorId:string,operation:string,proposalId?:string,restoredFromId?:string,parentVersion?:number){
  const id=sha256(canonical([state.incidentId,state.version]));
  const stateJson=canonical(state),stateDigest=sha256(stateJson);
  const existing=ctx.db.scenarioHistory.id.find(id);
  if(existing){if(existing.stateDigest!==stateDigest)fail("VERSION_CONFLICT","Immutable scenario snapshot differs");return id;}
  ctx.db.scenarioHistory.insert({id,incidentId:state.incidentId,scenarioVersion:state.version,parentVersion,operation,stateJson,stateDigest,proposalId,restoredFromId,createdBy:actorId,createdAt:iso(ctx)});return id;
}
export const checkpointScenario=db.reducer({...scopedMeta},(ctx,args)=>command(ctx,"checkpointScenario",args,args.incidentId,"SIMULATE",actor=>{
  if(actor.service)fail("FORBIDDEN","Human checkpoint required");
  return captureScenario(ctx,scenarioFor(ctx,args.incidentId).state as Scenario,actor.id,"CHECKPOINT");
}));
export const restoreScenario = db.reducer({...scopedMeta,snapshotId:t.string(),reason:t.string(),expectedVersion:t.u32()},(ctx,args)=>command(ctx,"restoreScenario",args,args.incidentId,"RESTORE_SIMULATION",actor=>{
  if(actor.service)fail("FORBIDDEN","Human restoration required");
  text(args.reason,"restoration reason",2000);
  const inc=scoped(ctx.db.incidents.id.find(args.incidentId),args.incidentId,"Incident");
  if(inc.classification!=="SYNTHETIC" || !["INVESTIGATING","CONTAINMENT_PENDING","CONTAINING"].includes(inc.status))fail("INVALID_TRANSITION","Synthetic active incident required");
  version(inc.scenarioVersion,args.expectedVersion);
  const snapshot=scoped(ctx.db.scenarioHistory.id.find(args.snapshotId),args.incidentId,"Snapshot");
  if(sha256(snapshot.stateJson)!==snapshot.stateDigest)fail("SIMULATION_FAILED","Snapshot integrity mismatch");
  const current=scenarioFor(ctx,args.incidentId).state as Scenario;
  let result:ReturnType<typeof previewRestore>;
  try{result=previewRestore(current,JSON.parse(snapshot.stateJson) as Scenario,args.expectedVersion);}catch{fail("SIMULATION_FAILED","Snapshot restoration validation failed");}
  if(result.nextState.version>0xffffffff)fail("SIMULATION_FAILED","Scenario version exhausted");
  captureScenario(ctx,current,actor.id,"CHECKPOINT");
  const id=captureScenario(ctx,result.nextState,actor.id,"RESTORE",undefined,snapshot.id,current.version);
  ctx.db.simScenarios.id.update({id:args.incidentId,incidentId:args.incidentId,state:{...result.nextState,edges:result.nextState.edges.map(e=>({...e,credentialId:e.credentialId}))}});
  for(const asset of result.nextState.assets){
    const old=scoped(ctx.db.assets.id.find(asset.id),args.incidentId,"Asset");
    const state=asset.state==="ISOLATED"?"ISOLATED":result.after.disruptedServiceIds.includes(asset.id)?"DEGRADED":result.nextState.compromisedAssetIds.includes(asset.id)?"COMPROMISED":"ACTIVE";
    const riskLabels=asset.credentialEnabled?old.riskLabels.filter(label=>label!=="CREDENTIAL_DISABLED"):[...new Set([...old.riskLabels,"CREDENTIAL_DISABLED"])];
    ctx.db.assets.id.update({...old,state,riskLabels,version:old.version+(state!==old.state || canonical(riskLabels)!==canonical(old.riskLabels)?1:0)});
  }
  for(const edge of result.nextState.edges){const old=scoped(ctx.db.graphEdges.id.find(edge.id),args.incidentId,"Edge");ctx.db.graphEdges.id.update({...old,enabled:edge.enabled});}
  ctx.db.incidents.id.update({...inc,scenarioVersion:result.nextState.version,version:inc.version+1,updatedAt:iso(ctx)});
  return id;
},true));
export const startInvestigation = db.reducer(
  { ...scopedMeta, objective: t.string() },
  (ctx, args) =>
    command(
      ctx,
      "startInvestigation",
      args,
      args.incidentId,
      "INVESTIGATE",
      (actor) => {
        if (actor.service)
          fail("FORBIDDEN", "Human investigation request required");
        text(args.objective, "objective", 2000);
        const id = uid(ctx, "run");
        ctx.db.investigationExpiry.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 120000000n), runId: id });
        ctx.db.investigations.insert({
          id,
          incidentId: args.incidentId,
          objective: args.objective,
          status: "QUEUED",
          requestedBy: actor.id,
          provider: undefined,
          model: undefined,
          createdAt: iso(ctx),
          updatedAt: iso(ctx),
          planningJson:undefined,
        });
        return id;
      },
    ),
);
export const recordInvestigationEvent = db.reducer(
  {
    ...scopedMeta,
    runId: t.string(),
    type: t.string(),
    provider: t.option(t.string()),
    model: t.option(t.string()),
    tool: t.option(t.string()),
    summary: t.option(t.string()),
    dataJson: t.option(t.string()),
  },
  (ctx, args) =>
    command(
      ctx,
      "recordInvestigationEvent",
      args,
      args.incidentId,
      "INVESTIGATE",
      (actor) => {
        if (!actor.service)
          fail("FORBIDDEN", "Trusted incident-scoped AI service required");
        const run = scoped(
          ctx.db.investigations.id.find(args.runId),
          args.incidentId,
          "Investigation",
        );
        requireActiveRun(ctx, run);
        if (!actor.service && run.requestedBy !== actor.id)
          fail("FORBIDDEN", "Run owned by another responder");
        oneOf(
          args.type,
          [
            "run_started",
            ...PROVIDER_CALL_EVENT_TYPES,
            "tool_started",
            "tool_completed",
            "tool_failed",
            "finding",
            "proposal",
            "run_completed",
            "run_failed",
          ],
          "event",
        );
        if (seconds(ctx) * 1000 >= Date.parse(run.createdAt) + 120000) fail("INVALID_TRANSITION", "Run deadline exceeded");
        if (["COMPLETED", "FAILED", "CANCELLED"].includes(run.status))
          fail("INVALID_TRANSITION", "Investigation finished");
        if ("dataJson" in args && args.dataJson !== undefined) boundedTraceJson(args.dataJson);
        if (args.summary && args.summary.length > 4000)
          fail("INVALID_INPUT", "Summary too large");
        if (args.provider) text(args.provider, "provider", 100);
        if (args.model) text(args.model, "model", 200);
        if (args.tool) text(args.tool, "tool", 100);
        if (args.type === "run_started" && (!args.provider || !args.model))
          fail("INVALID_INPUT", "Actual provider/model required");
        if (args.type === "run_started" && run.status !== "QUEUED")
          fail("INVALID_TRANSITION", "Run already started");
        if (
          args.type !== "run_started" &&
          args.type !== "run_failed" &&
          run.status !== "RUNNING"
        )
          fail("INVALID_TRANSITION", "Run not started");
        let planningJson=run.planningJson;
        let dataJson=args.dataJson;
        const providerEvent = isProviderCallEvent(args.type);
        if (isProviderCallEvent(args.type)) {
          if (!args.provider || !args.model || !args.dataJson) fail("INVALID_INPUT", "Actual provider/model and call metadata required");
          let data: ReturnType<typeof providerCallData>;
          try { data = providerCallData(JSON.parse(args.dataJson), args.type); } catch { fail("INVALID_INPUT", "Invalid provider call metadata"); }
          // Current gateway permits external inference over sanitized synthetic evidence only.
          if (data.classification !== "SYNTHETIC") fail("EVIDENCE_REDACTED", "Only synthetic provider calls permitted");
          const prior = [...ctx.db.streamEvents.incidentId.filter(args.incidentId)].filter(e => e.runId === run.id && isProviderCallEvent(e.type) && e.dataJson && JSON.parse(e.dataJson).providerCallId === data.providerCallId);
          if (args.type === "provider_call_started") {
            if (prior.length) fail("INVALID_TRANSITION", "Provider call already started");
          } else {
            const started = prior.find(e => e.type === "provider_call_started");
            if (!started || prior.some(e => e.type !== "provider_call_started")) fail("INVALID_TRANSITION", "Provider call missing start or already finished");
            const startData = JSON.parse(started.dataJson!);
            if (started.provider !== args.provider || started.model !== args.model || startData.step !== data.step || startData.mode !== data.mode || startData.endpoint !== data.endpoint || startData.classification !== data.classification) fail("INVALID_INPUT", "Provider call attribution mismatch");
          }
          dataJson = canonical(data);
        }
        if(args.type==="run_completed" && args.dataJson){
          const data=JSON.parse(args.dataJson);
          if(data?.planning!==undefined){
            try{planningJson=canonical(canonicalPlanning(data.planning,scenarioFor(ctx,args.incidentId).state as Scenario));dataJson=canonical({...data,planning:JSON.parse(planningJson)});}
            catch{fail("INVALID_MODEL_OUTPUT","Invalid completed planning");}
          }
        }
        const id = uid(ctx, "event");
        const { idempotencyKey, ...event } = args;
        ctx.db.streamEvents.insert({
          ...event,
          id,
          time: iso(ctx),
          provider: args.provider,
          model: args.model,
          tool: providerEvent ? undefined : args.tool,
          summary: providerEvent ? undefined : args.summary,
          payloadJson: undefined,
          dataJson,
        });
        const status =
          args.type === "run_completed"
            ? "COMPLETED"
            : args.type === "run_failed"
              ? "FAILED"
              : "RUNNING";
        ctx.db.investigations.id.update({
          ...run,
          status,
          planningJson,
          provider: providerEvent ? run.provider : args.provider ?? run.provider,
          model: providerEvent ? run.model : args.model ?? run.model,
          updatedAt: iso(ctx),
        });
        return id;
      },
    ),
);
export const recordToolRun = db.reducer(
  {
    ...scopedMeta,
    runId: t.string(),
    tool: t.string(),
    argumentsDigest: t.string(),
    toolCallId: t.option(t.string()),
    providerLatencyMs: t.option(t.f64()),
    resultJson: t.option(t.string()),
    citationsJson: t.option(t.string()),
    failureCode: t.option(t.string()),
    status: t.string(),
    durationMs: t.option(t.f64()),
    evidenceIds: t.array(t.string()),
    summary: t.option(t.string()),
  },
  (ctx, args) =>
    command(
      ctx,
      "recordToolRun",
      args,
      args.incidentId,
      "INVESTIGATE",
      (actor) => {
        if (!actor.service)
          fail("FORBIDDEN", "Trusted incident-scoped AI service required");
        const run = scoped(
          ctx.db.investigations.id.find(args.runId),
          args.incidentId,
          "Investigation",
        );
        requireActiveRun(ctx, run);
        if (
          run.status !== "RUNNING" ||
          (!actor.service && run.requestedBy !== actor.id)
        )
          fail("FORBIDDEN", "Run unavailable");
        text(args.tool, "tool", 100);
        if (args.toolCallId !== undefined) text(args.toolCallId, "tool call", 200);
        if (args.failureCode !== undefined) text(args.failureCode, "failure", 100);
        if (args.providerLatencyMs !== undefined && (!Number.isFinite(args.providerLatencyMs) || args.providerLatencyMs < 0)) fail("INVALID_INPUT", "Invalid provider latency");
        if (args.resultJson !== undefined) boundedTraceJson(args.resultJson);
        if (args.citationsJson !== undefined) {
          boundedTraceJson(args.citationsJson);
          const packet = JSON.parse(args.citationsJson);
          if (!Array.isArray(packet) || packet.length !== args.evidenceIds.length) fail("INVALID_INPUT", "Citation packet mismatch");
          for (let i=0;i<packet.length;i++) {
            const citation = packet[i];
            if (!citation || citation.evidenceId !== args.evidenceIds[i] || !Number.isInteger(citation.version) || typeof citation.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(citation.sha256)) fail("INVALID_INPUT", "Invalid citation provenance");
            const evidence = scoped(ctx.db.evidence.id.find(citation.evidenceId),args.incidentId,"Evidence");
            if (evidence.version !== citation.version) fail("VERSION_CONFLICT", "Evidence citation version changed");
          }
        }
        if (!/^[a-f0-9]{64}$/.test(args.argumentsDigest))
          fail("INVALID_INPUT", "Arguments digest required");
        oneOf(args.status, ["RUNNING", "COMPLETED", "FAILED"], "tool status");
        citations(ctx, args.incidentId, args.evidenceIds, true);
        if (args.summary && args.summary.length > 4000)
          fail("INVALID_INPUT", "Summary too large");
        if (
          args.durationMs !== undefined &&
          (!Number.isFinite(args.durationMs) || args.durationMs < 0)
        )
          fail("INVALID_INPUT", "Invalid duration");
        const id = uid(ctx, "tool");
        ctx.db.toolRuns.insert({
          id,
          incidentId: args.incidentId,
          investigationId: args.runId,
          tool: args.tool,
          argumentsDigest: args.argumentsDigest,
          toolCallId: args.toolCallId, providerLatencyMs: args.providerLatencyMs,
          resultJson: args.resultJson, citationsJson: args.citationsJson, failureCode: args.failureCode,
          status: args.status,
          durationMs: args.durationMs,
          evidenceIds: args.evidenceIds,
          summary: args.summary,
          createdAt: iso(ctx),
        });
        return id;
      },
    ),
);
export const recordFinding = db.reducer(
  {
    ...scopedMeta,
    runId: t.string(),
    title: t.string(),
    summary: t.string(),
    evidenceIds: t.array(t.string()),
    assetIds: t.array(t.string()),
    confidence: t.string(),
    unknowns: t.array(t.string()),
    recommendedNextQueries:t.option(t.array(t.string())),
  },
  (ctx, args) =>
    command(
      ctx,
      "recordFinding",
      args,
      args.incidentId,
      "INVESTIGATE",
      (actor) => {
        if (!actor.service)
          fail("FORBIDDEN", "Trusted incident-scoped AI service required");
        const run = scoped(
          ctx.db.investigations.id.find(args.runId),
          args.incidentId,
          "Investigation",
        );
        requireActiveRun(ctx, run);
        if (
          run.status !== "RUNNING" ||
          (!actor.service && run.requestedBy !== actor.id)
        )
          fail("FORBIDDEN", "Run unavailable");
        text(args.title, "finding title", 200);
        text(args.summary, "finding summary", 4000);
        oneOf(args.confidence, ["LOW", "MEDIUM", "HIGH"], "confidence");
        citations(ctx, args.incidentId, args.evidenceIds, true);
        if (
          !args.evidenceIds.length ||
          args.assetIds.length > 100 ||
          args.unknowns.length > 30 ||
          args.unknowns.some((x) => x.length > 1000)
        )
          fail("INVALID_MODEL_OUTPUT", "Finding requires bounded evidence");
        for (const id of args.assetIds)
          scoped(ctx.db.assets.id.find(id), args.incidentId, "Asset");
        let recommendedNextQueries:string[]|undefined;
        try{recommendedNextQueries=boundedNextQueries(args.recommendedNextQueries);}catch{fail("INVALID_MODEL_OUTPUT","Invalid recommended next queries");}
        const id = uid(ctx, "finding");
        ctx.db.findings.insert({
          id,
          incidentId: args.incidentId,
          investigationId: args.runId,
          title: args.title,
          summary: args.summary,
          evidenceIds: args.evidenceIds,
          assetIds: args.assetIds,
          confidence: args.confidence,
          unknowns: args.unknowns,
          recommendedNextQueries,
          verificationStatus: "HYPOTHESIS",
          createdAt: iso(ctx),
        });
        return id;
      },
    ),
);
function scenarioFor(ctx: Ctx, incidentId: string) {
  return scoped(
    ctx.db.simScenarios.id.find(incidentId),
    incidentId,
    "Scenario",
  );
}
function actionTargets(
  ctx: Ctx,
  incidentId: string,
  action: { type: string; targetIds: string[] },
) {
  oneOf(
    action.type,
    [
      "ISOLATE_SIMULATED_HOST",
      "BLOCK_SIMULATED_ROUTE",
      "RESET_SIMULATED_CREDENTIAL",
    ],
    "action type",
  );
  if (
    !action.targetIds.length ||
    action.targetIds.length > 20 ||
    new Set(action.targetIds).size !== action.targetIds.length
  )
    fail("INVALID_INPUT", "Invalid targets");
  for (const id of action.targetIds) {
    if (action.type === "BLOCK_SIMULATED_ROUTE") {
      const edge = scoped(ctx.db.graphEdges.id.find(id), incidentId, "Route");
      if (edge.type !== "COMMUNICATES_WITH")
        fail("INVALID_INPUT", "Target must be communication route");
    } else scoped(ctx.db.assets.id.find(id), incidentId, "Asset");
  }
}
export const proposeAction = db.reducer(
  {
    ...scopedMeta,
    action: tables.Action,
    rationale: t.string(),
    evidenceIds: t.array(t.string()),
    assumptions: t.array(t.string()),
    uncertainty: t.array(t.string()),
    planningJson:t.option(t.string()),
    investigationId: t.option(t.string()),
    expectedVersion: t.u32(),
  },
  (ctx, args) =>
    command(ctx, "proposeAction", args, args.incidentId, "PROPOSE", (actor) => {
      const inc = scoped(
        ctx.db.incidents.id.find(args.incidentId),
        args.incidentId,
        "Incident",
      );
      if (
        !["INVESTIGATING", "CONTAINMENT_PENDING", "CONTAINING"].includes(
          inc.status,
        )
      )
        fail("INVALID_TRANSITION", "Incident not in response stage");
      version(inc.scenarioVersion, args.expectedVersion);
      actionTargets(ctx, args.incidentId, args.action);
      citations(ctx, args.incidentId, args.evidenceIds, actor.service);
      if (!args.evidenceIds.length)
        fail("INVALID_INPUT", "Proposal requires evidence");
      text(args.rationale, "rationale", 4000);
      if (
        args.assumptions.length > 30 ||
        args.uncertainty.length > 30 ||
        [...args.assumptions, ...args.uncertainty].some((x) => x.length > 1000)
      )
        fail("INVALID_INPUT", "Invalid assumptions");
      if (args.investigationId) {
        const run = scoped(ctx.db.investigations.id.find(args.investigationId),args.incidentId,"Investigation");
        if (actor.service) { requireActiveRun(ctx,run); if(run.status!=="RUNNING") fail("INVALID_TRANSITION","Run unavailable"); }
      } else if (actor.service) fail("INVALID_INPUT", "Service proposal requires active investigation");
      let planningJson:string|undefined;
      if(args.planningJson!==undefined){
        if(args.planningJson.length>20000)fail("INVALID_MODEL_OUTPUT","Planning too large");
        try{
          const plan=canonicalPlanning(JSON.parse(args.planningJson),scenarioFor(ctx,args.incidentId).state as Scenario,args.action as SimAction);
          if(canonical(plan.assumptions)!==canonical(args.assumptions)||canonical(plan.uncertainty)!==canonical(args.uncertainty))fail("INVALID_MODEL_OUTPUT","Planning text mismatch");
          planningJson=canonical(plan);
        }catch{fail("INVALID_MODEL_OUTPUT","Invalid response planning");}
      }
      const id = uid(ctx, "proposal");
      const action = {
        ...args.action,
        targetIds: [...args.action.targetIds].sort(),
      };
      const payloadDigest = sha256(
        canonical({
          incidentId: args.incidentId,
          action,
          rationale: args.rationale,
          evidenceIds: [...args.evidenceIds].sort(),
          assumptions: args.assumptions,
          uncertainty: args.uncertainty,
          planningJson,
          expectedVersion: args.expectedVersion,
        }),
      );
      ctx.db.proposals.insert({
        id,
        incidentId: args.incidentId,
        investigationId: args.investigationId,
        requestedBy: actor.id,
        action,
        rationale: args.rationale,
        evidenceIds: args.evidenceIds,
        assumptions: args.assumptions,
        uncertainty: args.uncertainty,
        planningJson,
        status: "VALIDATED",
        expectedVersion: args.expectedVersion,
        version: 1,
        payloadDigest,
        simulationId: undefined,
        createdAt: iso(ctx),
        updatedAt: iso(ctx),
      });
      return id;
    }),
);
function preview(
  ctx: Ctx,
  incidentId: string,
  proposal: ReturnType<typeof ctx.db.proposals.id.find>,
  expectedVersion: number,
) {
  if (!proposal) fail("NOT_FOUND", "Proposal unavailable");
  const base = scenarioFor(ctx, incidentId);
  version(base.state.version, expectedVersion);
  try {
    return simulateResponse(
      base.state as Scenario,
      proposal.action as SimAction,
      expectedVersion,
    );
  } catch (error) {
    if (error instanceof Error && "code" in error)
      fail(String(error.code), error.message);
    throw error;
  }
}
function remainingPaths(state: Scenario) {
  const out: string[][] = [];
  const active = new Set(
    state.assets.filter((a) => a.state === "ACTIVE").map((a) => a.id),
  );
  const visit = (path: string[]) => {
    const last = path[path.length - 1];
    if (state.protectedAssetIds.includes(last)) {
      out.push(path);
      return;
    }
    if (out.length >= 100) return;
    for (const e of [...state.edges].sort((a, b) => a.id.localeCompare(b.id)))
      if (
        e.type === "COMMUNICATES_WITH" &&
        e.enabled &&
        e.from === last &&
        active.has(e.to) &&
        !path.includes(e.to)
      )
        visit([...path, e.to]);
  };
  for (const id of [...state.compromisedAssetIds].sort())
    if (active.has(id)) visit([id]);
  return out;
}
function diffFor(
  ctx: Ctx,
  incidentId: string,
  result: ReturnType<typeof simulateResponse>,
) {
  const assetChanges = [...ctx.db.assets.incidentId.filter(incidentId)].flatMap(
    (before) => {
      const next = result.nextState.assets.find((a) => a.id === before.id)!;
      const after =
        next.state === "ISOLATED"
          ? "ISOLATED"
          : result.after.disruptedServiceIds.includes(before.id)
            ? "DEGRADED"
            : before.state;
      return before.state !== after
        ? [{ assetId: before.id, before: before.state, after }]
        : [];
    },
  );
  return {
    assetChanges,
    edgeChanges: result.changedEdgeIds.map((edgeId) => ({
      edgeId,
      before: scoped(ctx.db.graphEdges.id.find(edgeId), incidentId, "Edge")
        .enabled,
      after: result.nextState.edges.find((e) => e.id === edgeId)!.enabled,
    })),
    disruptedServiceIds: result.after.disruptedServiceIds,
    containedAssetIds: result.before.reachableAssetIds.filter(
      (id) => !result.after.reachableAssetIds.includes(id),
    ),
    unresolvedPaths: remainingPaths(result.nextState),
    containmentCoverage: result.after.containmentCoverage,
    warnings: result.warnings,
  };
}
export const simulateAction = db.reducer(
  { ...scopedMeta, proposalId: t.string(), expectedVersion: t.u32() },
  (ctx, args) =>
    command(ctx, "simulateAction", args, args.incidentId, "SIMULATE", () => {
      const proposal = scoped(
        ctx.db.proposals.id.find(args.proposalId),
        args.incidentId,
        "Proposal",
      );
      if (
        !["VALIDATED", "PENDING_APPROVAL", "APPROVED", "REJECTED"].includes(
          proposal.status,
        )
      )
        fail("INVALID_TRANSITION", "Cannot simulate action");
      const result = preview(
        ctx,
        args.incidentId,
        proposal,
        args.expectedVersion,
      );
      const id = uid(ctx, "branch");
      ctx.db.simBranches.insert({
        id,
        incidentId: args.incidentId,
        proposalId: proposal.id,
        parentVersion: args.expectedVersion,
        scenarioSeed: result.scenarioSeed,
        payloadDigest: proposal.payloadDigest,
        diff: diffFor(ctx, args.incidentId, result),
        createdAt: iso(ctx),
      });
      ctx.db.proposals.id.update({
        ...proposal,
        status: "PENDING_APPROVAL",
        expectedVersion: args.expectedVersion,
        version: proposal.version + 1,
        simulationId: id,
        updatedAt: iso(ctx),
      });
      return id;
    }),
);
export const approveAction = db.reducer(
  {
    ...scopedMeta,
    proposalId: t.string(),
    decision: t.string(),
    justification: t.string(),
    expectedVersion: t.u32(),
    proposalVersion: t.u32(),
  },
  (ctx, args) =>
    command(
      ctx,
      "approveAction",
      args,
      args.incidentId,
      "APPROVE",
      (actor) => {
        const proposal = scoped(
          ctx.db.proposals.id.find(args.proposalId),
          args.incidentId,
          "Proposal",
        );
        if (actor.service || actor.id === proposal.requestedBy)
          fail("FORBIDDEN", "A different human commander must approve");
        oneOf(args.decision, ["APPROVE", "REJECT"], "decision");
        text(args.justification, "justification", 2000);
        if (proposal.status !== "PENDING_APPROVAL" || !proposal.simulationId)
          fail("INVALID_TRANSITION", "Simulation required before approval");
        version(proposal.version, args.proposalVersion);
        version(
          scenarioFor(ctx, args.incidentId).state.version,
          args.expectedVersion,
        );
        version(proposal.expectedVersion, args.expectedVersion);
        const branch = scoped(
          ctx.db.simBranches.id.find(proposal.simulationId),
          args.incidentId,
          "Simulation",
        );
        if (
          branch.payloadDigest !== proposal.payloadDigest ||
          branch.parentVersion !== args.expectedVersion
        )
          fail("VERSION_CONFLICT", "Simulation drift");
        const id = uid(ctx, "approval");
        ctx.db.approvals.insert({
          id,
          incidentId: args.incidentId,
          proposalId: proposal.id,
          approverId: actor.id,
          decision: args.decision,
          justification: args.justification,
          payloadDigest: proposal.payloadDigest,
          scenarioVersion: args.expectedVersion,
          proposalVersion: proposal.version + 1,
          createdAt: iso(ctx),
          expiresAt: new Date((seconds(ctx) + 300) * 1000).toISOString(),
        });
        ctx.db.proposals.id.update({
          ...proposal,
          status: args.decision === "APPROVE" ? "APPROVED" : "REJECTED",
          version: proposal.version + 1,
          updatedAt: iso(ctx),
        });
        return id;
      },
      true,
    ),
);
export const executeSimulation = db.reducer(
  { ...scopedMeta, proposalId: t.string(), expectedVersion: t.u32() },
  (ctx, args) =>
    command(
      ctx,
      "executeSimulation",
      args,
      args.incidentId,
      "EXECUTE_SIMULATION",
      (actor) => {
        const proposal = scoped(
          ctx.db.proposals.id.find(args.proposalId),
          args.incidentId,
          "Proposal",
        );
        if (proposal.status !== "APPROVED" || !proposal.simulationId)
          fail("INVALID_TRANSITION", "Human approval required");
        const inc = scoped(
          ctx.db.incidents.id.find(args.incidentId),
          args.incidentId,
          "Incident",
        );
        if (
          !["INVESTIGATING", "CONTAINMENT_PENDING", "CONTAINING"].includes(
            inc.status,
          ) ||
          inc.classification !== "SYNTHETIC"
        )
          fail("INVALID_TRANSITION", "Synthetic active incident required");
        version(inc.scenarioVersion, args.expectedVersion);
        const approval = [
          ...ctx.db.approvals.proposalId.filter(proposal.id),
        ].find(
          (a) =>
            a.decision === "APPROVE" &&
            a.proposalVersion === proposal.version &&
            a.payloadDigest === proposal.payloadDigest &&
            a.scenarioVersion === args.expectedVersion,
        );
        if (!approval) fail("FORBIDDEN", "Matching human approval required");
        const approver = ctx.db.users.id.find(approval.approverId);
        const approverMember = [
          ...ctx.db.incidentMembers.byUserIncident.filter([
            approval.approverId,
            args.incidentId,
          ]),
        ].find((m) => m.active && m.role === "COMMANDER");
        if (
          !approver ||
          approver.status !== "ACTIVE" ||
          approver.service ||
          !approverMember ||
          approval.approverId === proposal.requestedBy
        )
          fail("FORBIDDEN", "Approval authority revoked");
        if (Date.parse(approval.expiresAt) <= seconds(ctx) * 1000)
          fail(
            "APPROVAL_EXPIRED",
            "Approval expired; resimulate and reapprove",
          );
        const branch = scoped(
          ctx.db.simBranches.id.find(proposal.simulationId),
          args.incidentId,
          "Simulation",
        );
        const result = preview(
          ctx,
          args.incidentId,
          proposal,
          args.expectedVersion,
        );
        if (
          branch.payloadDigest !== proposal.payloadDigest ||
          branch.parentVersion !== args.expectedVersion ||
          canonical(branch.diff) !==
            canonical(diffFor(ctx, args.incidentId, result))
        )
          fail("VERSION_CONFLICT", "Preview differs; resimulate and reapprove");
        captureScenario(ctx,scenarioFor(ctx,args.incidentId).state as Scenario,actor.id,"CHECKPOINT");
        captureScenario(ctx,result.nextState,actor.id,"EXECUTION",proposal.id,undefined,args.expectedVersion);
        ctx.db.proposals.id.update({
          ...proposal,
          status: "EXECUTING",
          updatedAt: iso(ctx),
        });
        ctx.db.simScenarios.id.update({
          id: args.incidentId,
          incidentId: args.incidentId,
          state: {
            ...result.nextState,
            edges: result.nextState.edges.map((e) => ({
              ...e,
              credentialId: e.credentialId,
            })),
          },
        });
        for (const a of result.nextState.assets) {
          const old = scoped(
            ctx.db.assets.id.find(a.id),
            args.incidentId,
            "Asset",
          );
          const state =
            a.state === "ISOLATED"
              ? "ISOLATED"
              : result.after.disruptedServiceIds.includes(a.id)
                ? "DEGRADED"
                : old.state;
          const riskLabels = a.credentialEnabled
            ? old.riskLabels
            : [...new Set([...old.riskLabels, "CREDENTIAL_DISABLED"])];
          ctx.db.assets.id.update({
            ...old,
            state,
            riskLabels,
            version:
              old.version +
              (state !== old.state ||
              riskLabels.length !== old.riskLabels.length
                ? 1
                : 0),
          });
        }
        for (const e of result.nextState.edges) {
          const old = scoped(
            ctx.db.graphEdges.id.find(e.id),
            args.incidentId,
            "Edge",
          );
          ctx.db.graphEdges.id.update({ ...old, enabled: e.enabled });
        }
        ctx.db.incidents.id.update({
          ...inc,
          scenarioVersion: result.nextState.version,
          version: inc.version + 1,
          status: "CONTAINING",
          updatedAt: iso(ctx),
        });
        const verification = verifyExecution(
          result.nextState,
          scenarioFor(ctx, args.incidentId).state as Scenario,
        );
        const id = uid(ctx, "verification");
        ctx.db.verifications.insert({
          id,
          incidentId: args.incidentId,
          proposalId: proposal.id,
          status: verification.status,
          expectedVersion: result.nextState.version,
          observedVersion: scenarioFor(ctx, args.incidentId).state.version,
          summary: verification.mismatches.length
            ? verification.mismatches.join("; ")
            : "Synthetic execution matches deterministic preview. Remaining paths are reported separately.",
          createdAt: iso(ctx),
        });
        const reassessment = verificationReassessment(verification.status, id, proposal.id);
        if (reassessment) {
          const taskId = uid(ctx, "task");
          const { detail, ...task } = reassessment;
          ctx.db.tasks.insert({ ...task, id: taskId, incidentId: args.incidentId, assigneeId: actor.id, dueAt: undefined, version: 1, createdAt: iso(ctx) });
          audit(ctx, actor.id, args.incidentId, "verificationReassessmentQueued", taskId, args.correlationId, canonical(detail));
        }
        ctx.db.proposals.id.update({
          ...proposal,
          status: verification.status,
          version: proposal.version + 1,
          updatedAt: iso(ctx),
        });
        audit(
          ctx,
          actor.id,
          args.incidentId,
          "simulationVerified",
          id,
          args.correlationId,
        );
        return id;
      },
      true,
    ),
);
export const exportReport = db.reducer({ ...scopedMeta }, (ctx, args) =>
  command(ctx, "exportReport", args, args.incidentId, "EXPORT", (actor) => {
    const incident = scoped(
      ctx.db.incidents.id.find(args.incidentId),
      args.incidentId,
      "Incident",
    );
    const id = uid(ctx, "report");
    const summary = canonical({
      title: incident.title,
      status: incident.status,
      scenarioVersion: incident.scenarioVersion,
      evidenceIds: [...ctx.db.evidence.incidentId.filter(args.incidentId)].map(
        (e) => e.id,
      ),
      evidenceIndex: evidenceIndex([...ctx.db.evidence.incidentId.filter(args.incidentId)]),
      actions: actionIndex([...ctx.db.proposals.incidentId.filter(args.incidentId)]),
      investigations: [...ctx.db.investigations.incidentId.filter(args.incidentId)].map(r=>({id:r.id,status:r.status,provider:r.provider,model:r.model,...(r.planningJson?{planning:planningIndex(r.planningJson)}:{}),requestedBy:r.requestedBy,createdAt:r.createdAt,updatedAt:r.updatedAt})),
      findings: findingIndex([...ctx.db.findings.incidentId.filter(args.incidentId)]),
      findingReviews: findingReviews([...ctx.db.auditEvents.incidentId.filter(args.incidentId)]),
      retentionPolicy: ctx.db.incidentRetentionPolicies.id.find(args.incidentId) ?? defaultRetentionPolicy(args.incidentId),
      providerCalls: [...ctx.db.streamEvents.incidentId.filter(args.incidentId)].filter(e => isProviderCallEvent(e.type)).map(e => ({ eventId: e.id, runId: e.runId, type: e.type, time: e.time, provider: e.provider, model: e.model, correlationId: e.correlationId, data: providerCallData(JSON.parse(e.dataJson!), e.type as (typeof PROVIDER_CALL_EVENT_TYPES)[number]) })),
      graphReviews: [...ctx.db.graphReviews.incidentId.filter(args.incidentId)],
      scenarioHistory: [...ctx.db.scenarioHistory.incidentId.filter(args.incidentId)].map(({stateJson,...metadata})=>metadata),
      decisions: [...ctx.db.approvals.incidentId.filter(args.incidentId)],
      verifications: [
        ...ctx.db.verifications.incidentId.filter(args.incidentId),
      ],
      unknowns: reportUnknowns([...ctx.db.findings.incidentId.filter(args.incidentId)], [...ctx.db.proposals.incidentId.filter(args.incidentId)]),
    });
    ctx.db.incidentReports.insert({
      id,
      incidentId: args.incidentId,
      version: incident.version,
      createdBy: actor.id,
      createdAt: iso(ctx),
      summary,
    });
    return id;
  }),
);
const Profile = t.row("ProfileRow", {
  id: t.string().primaryKey(),
  displayName: t.string(),
  status: t.string(),
  platformAdmin: t.bool(),
});
export const myProfile = db.view(
  { name: "my_profile", public: true },
  t.array(Profile),
  (ctx) => {
    const actor = readUser(ctx);
    return actor
      ? [
          {
            id: actor.id,
            displayName: actor.displayName,
            status: actor.status,
            platformAdmin: actor.platformAdmin,
          },
        ]
      : [];
  },
);
export const myInvitations = db.view(
  { name: "my_invitations", public: true },
  { lease: t.string() },
  t.array(tables.invitations.rowType),
  (ctx, { lease }) => {
    const actor = readUser(ctx, lease);
    return actor
      ? [...ctx.db.invitations.targetSubject.filter(actor.subject)].filter(
          (i) => !i.accepted,
        )
      : [];
  },
);
const Member = t.row("MemberRow", {
  id: t.string().primaryKey(),
  incidentId: t.string(),
  userId: t.string(),
  role: t.string(),
  active: t.bool(),
  joinedAt: t.string(),
  capabilities: t.array(t.string()),
});
export const scopedMemberships = db.view(
  { name: "scoped_memberships", public: true },
  { lease: t.string() },
  t.array(Member),
  (ctx, { lease }) => {
    const ids = visibleIds(ctx, lease);
    return [...ctx.db.incidentMembers.iter()]
      .filter((m) => ids.has(m.incidentId))
      .map((m) => ({ ...m, capabilities: grants[m.role] ?? [] }));
  },
);
export const scopedProfiles = db.view(
  { name: "scoped_profiles", public: true },
  { lease: t.string() },
  t.array(Profile),
  (ctx, { lease }) => {
    const ids = visibleIds(ctx, lease);
    const users = new Set(
      [...ctx.db.incidentMembers.iter()]
        .filter((m) => m.active && ids.has(m.incidentId))
        .map((m) => m.userId),
    );
    return [...ctx.db.users.iter()]
      .filter((u) => users.has(u.id))
      .map((u) => ({
        id: u.id,
        displayName: u.displayName,
        status: u.status,
        platformAdmin: u.platformAdmin,
      }));
  },
);
export const myReceipts = db.view(
  { name: "my_receipts", public: true },
  { lease: t.string() },
  t.array(tables.commandReceipts.rowType),
  (ctx, { lease }) => {
    const actor = readUser(ctx, lease);
    const ids = visibleIds(ctx, lease);
    return actor
      ? [...ctx.db.commandReceipts.userId.filter(actor.id)].filter(
          (r) => !r.incidentId || ids.has(r.incidentId),
        )
      : [];
  },
);
export const scopedIncidents = db.view(
  { name: "scoped_incidents", public: true },
  { lease: t.string() },
  t.array(tables.incidents.rowType),
  (ctx, { lease }) => {
    const ids = visibleIds(ctx, lease);
    return [...ctx.db.incidents.iter()].filter((row) =>
      ids.has(row.incidentId),
    );
  },
);
export const scopedAssets = db.view(
  { name: "scoped_assets", public: true },
  { lease: t.string() },
  t.array(tables.assets.rowType),
  (ctx, { lease }) => {
    const ids = visibleIds(ctx, lease);
    return [...ctx.db.assets.iter()].filter((row) => ids.has(row.incidentId));
  },
);
export const scopedEvidence = db.view(
  { name: "scoped_evidence", public: true },
  { lease: t.string() },
  t.array(tables.evidence.rowType),
  (ctx, { lease }) => {
    const ids = visibleIds(ctx, lease);
    return [...ctx.db.evidence.iter()].filter(
      (row) =>
        ids.has(row.incidentId) &&
        (!readUser(ctx, lease)?.service || row.modelApproved),
    );
  },
);
export const scopedIndicators = db.view(
  { name: "scoped_indicators", public: true },
  { lease: t.string() },
  t.array(tables.indicators.rowType),
  (ctx, { lease }) => {
    const ids = visibleIds(ctx, lease);
    return [...ctx.db.indicators.iter()].filter((row) =>
      ids.has(row.incidentId),
    );
  },
);
export const scopedEdges = db.view(
  { name: "scoped_edges", public: true },
  { lease: t.string() },
  t.array(tables.graphEdges.rowType),
  (ctx, { lease }) => {
    const ids = visibleIds(ctx, lease);
    return [...ctx.db.graphEdges.iter()].filter((row) =>
      ids.has(row.incidentId),
    );
  },
);
export const scopedInvestigations = db.view(
  { name: "scoped_investigations", public: true },
  { lease: t.string() },
  t.array(tables.investigations.rowType),
  (ctx, { lease }) => {
    const ids = visibleIds(ctx, lease);
    return [...ctx.db.investigations.iter()].filter((row) =>
      ids.has(row.incidentId),
    );
  },
);
export const scopedToolRuns = db.view(
  { name: "scoped_tool_runs", public: true },
  { lease: t.string() },
  t.array(tables.toolRuns.rowType),
  (ctx, { lease }) => {
    const ids = visibleIds(ctx, lease);
    return [...ctx.db.toolRuns.iter()].filter((row) => ids.has(row.incidentId));
  },
);
export const scopedFindings = db.view(
  { name: "scoped_findings", public: true },
  { lease: t.string() },
  t.array(tables.findings.rowType),
  (ctx, { lease }) => {
    const ids = visibleIds(ctx, lease);
    return [...ctx.db.findings.iter()].filter((row) => ids.has(row.incidentId));
  },
);
export const scopedProposals = db.view(
  { name: "scoped_proposals", public: true },
  { lease: t.string() },
  t.array(tables.proposals.rowType),
  (ctx, { lease }) => {
    const ids = visibleIds(ctx, lease);
    return [...ctx.db.proposals.iter()].filter((row) =>
      ids.has(row.incidentId),
    );
  },
);
const SnapshotMetadata=t.row("SnapshotMetadata",{
  id:t.string(),incidentId:t.string(),scenarioVersion:t.u32(),parentVersion:t.option(t.u32()),operation:t.string(),stateDigest:t.string(),proposalId:t.option(t.string()),restoredFromId:t.option(t.string()),createdBy:t.string(),createdAt:t.string(),
});
export const scopedScenarioHistory=db.view({name:"scoped_scenario_history",public:true},{lease:t.string()},t.array(SnapshotMetadata),(ctx,{lease})=>{
  const ids=visibleIds(ctx,lease);return [...ctx.db.scenarioHistory.iter()].filter(row=>ids.has(row.incidentId)).map(({stateJson,...metadata})=>metadata);
});
export const readScenarioSnapshot=db.procedure({incidentId:t.string(),snapshotId:t.string()},t.string(),(ctx,args)=>ctx.withTx(tx=>{
  const {actor}=requireIncident(tx,args.incidentId,"SIMULATE");if(actor.service)fail("FORBIDDEN","Human snapshot read required");
  const snapshot=scoped(tx.db.scenarioHistory.id.find(args.snapshotId),args.incidentId,"Snapshot");
  if(sha256(snapshot.stateJson)!==snapshot.stateDigest)fail("SIMULATION_FAILED","Snapshot integrity mismatch");
  return snapshot.stateJson;
}));
export const scopedScenarios = db.view(
  { name: "scoped_scenarios", public: true },
  { lease: t.string() },
  t.array(tables.simScenarios.rowType),
  (ctx, { lease }) => {
    const ids = visibleIds(ctx, lease);
    return [...ctx.db.simScenarios.iter()].filter((row) =>
      ids.has(row.incidentId),
    );
  },
);
export const scopedSimulations = db.view(
  { name: "scoped_simulations", public: true },
  { lease: t.string() },
  t.array(tables.simBranches.rowType),
  (ctx, { lease }) => {
    const ids = visibleIds(ctx, lease);
    return [...ctx.db.simBranches.iter()].filter((row) =>
      ids.has(row.incidentId),
    );
  },
);
export const scopedApprovals = db.view(
  { name: "scoped_approvals", public: true },
  { lease: t.string() },
  t.array(tables.approvals.rowType),
  (ctx, { lease }) => {
    if (readUser(ctx, lease)?.service) return [];
    const ids = visibleIds(ctx, lease);
    return [...ctx.db.approvals.iter()].filter((row) =>
      ids.has(row.incidentId),
    );
  },
);
export const scopedVerifications = db.view(
  { name: "scoped_verifications", public: true },
  { lease: t.string() },
  t.array(tables.verifications.rowType),
  (ctx, { lease }) => {
    const ids = visibleIds(ctx, lease);
    return [...ctx.db.verifications.iter()].filter((row) =>
      ids.has(row.incidentId),
    );
  },
);
export const scopedMessages = db.view(
  { name: "scoped_messages", public: true },
  { lease: t.string() },
  t.array(tables.messages.rowType),
  (ctx, { lease }) => {
    if (readUser(ctx, lease)?.service) return [];
    const ids = visibleIds(ctx, lease);
    return [...ctx.db.messages.iter()].filter((row) => ids.has(row.incidentId));
  },
);
export const scopedTasks = db.view(
  { name: "scoped_tasks", public: true },
  { lease: t.string() },
  t.array(tables.tasks.rowType),
  (ctx, { lease }) => {
    if (readUser(ctx, lease)?.service) return [];
    const ids = visibleIds(ctx, lease);
    return [...ctx.db.tasks.iter()].filter((row) => ids.has(row.incidentId));
  },
);
export const scopedPresence = db.view(
  { name: "scoped_presence", public: true },
  { lease: t.string() },
  t.array(tables.presence.rowType),
  (ctx, { lease }) => {
    if (readUser(ctx, lease)?.service) return [];
    const ids = visibleIds(ctx, lease);
    return [...ctx.db.presence.iter()].filter((row) => ids.has(row.incidentId));
  },
);
export const scopedAcknowledgments = db.view(
  { name: "scoped_acknowledgments", public: true },
  { lease: t.string() },
  t.array(tables.acknowledgments.rowType),
  (ctx, { lease }) => {
    if (readUser(ctx, lease)?.service) return [];
    const ids = visibleIds(ctx, lease);
    return [...ctx.db.acknowledgments.iter()].filter((row) =>
      ids.has(row.incidentId),
    );
  },
);
export const scopedAuditEvents = db.view(
  { name: "scoped_audit_events", public: true },
  { lease: t.string() },
  t.array(tables.auditEvents.rowType),
  (ctx, { lease }) => {
    if (readUser(ctx, lease)?.service) return [];
    const ids = visibleIds(ctx, lease);
    return [...ctx.db.auditEvents.iter()].filter((row) =>
      ids.has(row.incidentId),
    );
  },
);
export const scopedReports = db.view(
  { name: "scoped_reports", public: true },
  { lease: t.string() },
  t.array(tables.incidentReports.rowType),
  (ctx, { lease }) => {
    if (readUser(ctx, lease)?.service) return [];
    const ids = visibleIds(ctx, lease);
    return [...ctx.db.incidentReports.iter()].filter((row) =>
      ids.has(row.incidentId),
    );
  },
);
export const scopedStreamEvents = db.view(
  { name: "scoped_stream_events", public: true },
  { lease: t.string() },
  t.array(tables.streamEvents.rowType),
  (ctx, { lease }) => {
    const ids = visibleIds(ctx, lease);
    return [...ctx.db.streamEvents.iter()].map(row=>({...row,payloadJson:undefined})).filter((row) =>
      ids.has(row.incidentId),
    );
  },
);
export const setUserStatus = db.reducer(
  { ...meta, userId: t.string(), status: t.string(), reason: t.string() },
  (ctx, args) =>
    command(
      ctx,
      "setUserStatus",
      args,
      "",
      undefined,
      (actor) => {
        if (!actor.platformAdmin || actor.service)
          fail("FORBIDDEN", "Platform administration required");
        oneOf(args.status, ["ACTIVE", "DISABLED"], "account status");
        text(args.reason, "reason", 1000);
        const target = ctx.db.users.id.find(args.userId);
        if (!target) fail("NOT_FOUND", "User unavailable");
        if (
          target.platformAdmin &&
          args.status === "DISABLED" &&
          [...ctx.db.users.iter()].filter(
            (u) => u.platformAdmin && u.status === "ACTIVE",
          ).length <= 1
        )
          fail("INVALID_INPUT", "Cannot disable final platform administrator");
        ctx.db.users.id.update({
          ...target,
          status: args.status,
          revokedBefore:
            args.status === "DISABLED" ? seconds(ctx) : target.revokedBefore,
        });
        if (args.status === "DISABLED")
          for (const session of ctx.db.sessions.userId.filter(target.id))
            removeSession(ctx, session.id);
        return target.id;
      },
      true,
    ),
);
export const adminGrantIncident = db.reducer(
  { ...scopedMeta, userId: t.string(), role: t.string(), reason: t.string() },
  (ctx, args) =>
    command(
      ctx,
      "adminGrantIncident",
      args,
      args.incidentId,
      undefined,
      (actor) => {
        if (!actor.platformAdmin || actor.service)
          fail("FORBIDDEN", "Platform administration required");
        const incident = ctx.db.incidents.id.find(args.incidentId);
        if (!incident) fail("NOT_FOUND", "Incident unavailable");
        text(args.reason, "grant reason", 1000);
        oneOf(args.role, roles, "role");
        const target = ctx.db.users.id.find(args.userId);
        if (
          !target ||
          target.status !== "ACTIVE" ||
          target.service !== (args.role === "AI_SERVICE")
        )
          fail("INVALID_INPUT", "Invalid member");
        const member = [
          ...ctx.db.incidentMembers.byUserIncident.filter([
            args.userId,
            args.incidentId,
          ]),
        ][0];
        if (
          member?.active &&
          member.role === "COMMANDER" &&
          args.role !== "COMMANDER" &&
          [...ctx.db.incidentMembers.incidentId.filter(args.incidentId)].filter(
            (m) => m.active && m.role === "COMMANDER",
          ).length <= 1
        )
          fail("INVALID_INPUT", "Cannot demote final commander");
        if (member)
          ctx.db.incidentMembers.id.update({
            ...member,
            role: args.role,
            active: true,
          });
        else
          ctx.db.incidentMembers.insert({
            id: sha256(canonical([args.incidentId, args.userId])),
            incidentId: args.incidentId,
            userId: args.userId,
            role: args.role,
            active: true,
            joinedAt: iso(ctx),
          });
        return target.id;
      },
      true,
    ),
);
export const acceptFinding = db.reducer(
  { ...scopedMeta, findingId: t.string(), reason: t.string() },
  (ctx, args) =>
    command(
      ctx,
      "acceptFinding",
      args,
      args.incidentId,
      "MANAGE_INCIDENT",
      () => {
        text(args.reason, "verification reason", 1000);
        const finding = scoped(
          ctx.db.findings.id.find(args.findingId),
          args.incidentId,
          "Finding",
        );
        if (finding.verificationStatus !== "HYPOTHESIS")
          fail("INVALID_TRANSITION", "Finding already reviewed");
        citations(ctx, args.incidentId, finding.evidenceIds);
        ctx.db.findings.id.update({
          ...finding,
          verificationStatus: "VERIFIED",
        });
        return finding.id;
      },
      true,
    ),
);
const reviewableEdgeTypes=["OBSERVED_ON","INDICATES","AFFECTS","SUPPORTED_BY","TARGETS","MITIGATES"];
function edgeReviewPreparation(ctx:Ctx,incidentId:string,edgeId:string){
  const edge=scoped(ctx.db.graphEdges.id.find(edgeId),incidentId,"Edge");
  if(!reviewableEdgeTypes.includes(edge.type))fail("FORBIDDEN","Scenario routes cannot be human-reviewed");
  const evidenceRefs=edge.sourceEvidenceIds.map(id=>{
    const evidence=scoped(ctx.db.evidence.id.find(id),incidentId,"Evidence");
    return {evidenceId:evidence.id,version:evidence.version,sha256:evidence.sha256,redactedSha256:evidence.redactedSha256};
  }).sort((a,b)=>a.evidenceId.localeCompare(b.evidenceId));
  return {incidentId,edgeId,expectedEdgeDigest:sha256(canonical({edge,evidenceRefs})),evidenceRefs};
}
export const readGraphEdgeReview=db.procedure({incidentId:t.string(),edgeId:t.string()},t.string(),(ctx,args)=>ctx.withTx(tx=>{
  const {actor}=requireIncident(tx,args.incidentId,"MANAGE_INCIDENT");if(actor.service)fail("FORBIDDEN","Human review required");
  return canonical(edgeReviewPreparation(tx,args.incidentId,args.edgeId));
}));
export const reviewGraphEdge=db.reducer({...scopedMeta,edgeId:t.string(),findingId:t.option(t.string()),decision:t.string(),expectedEdgeDigest:t.string(),evidenceRefsJson:t.string(),reason:t.string()},(ctx,args)=>command(ctx,"reviewGraphEdge",args,args.incidentId,"MANAGE_INCIDENT",actor=>{
  if(actor.service)fail("FORBIDDEN","Human review required");
  oneOf(args.decision,["VERIFIED","DISPUTED"],"review decision");text(args.reason,"review reason",2000);
  const packet=edgeReviewPreparation(ctx,args.incidentId,args.edgeId);
  if(packet.expectedEdgeDigest!==args.expectedEdgeDigest)fail("VERSION_CONFLICT","Edge or source evidence changed");
  if(args.evidenceRefsJson.length>20000)fail("INVALID_INPUT","Review provenance too large");
  let refs:unknown;try{refs=JSON.parse(args.evidenceRefsJson);}catch{fail("INVALID_INPUT","Invalid evidence references");}
  if(canonical(refs)!==canonical(packet.evidenceRefs))fail("VERSION_CONFLICT","Source evidence versions differ");
  const edge=scoped(ctx.db.graphEdges.id.find(args.edgeId),args.incidentId,"Edge");
  if(edge.verificationStatus!=="HYPOTHESIS")fail("INVALID_TRANSITION","Edge already reviewed");
  if(args.decision==="VERIFIED"){
    if(edge.assertedBy===actor.id)fail("FORBIDDEN","Separate human reviewer required");
    if(!args.findingId)fail("INVALID_INPUT","Accepted finding required");
    const finding=scoped(ctx.db.findings.id.find(args.findingId),args.incidentId,"Finding");
    if(finding.verificationStatus!=="VERIFIED")fail("INVALID_TRANSITION","Finding must be accepted first");
    if(!edge.sourceEvidenceIds.length || edge.sourceEvidenceIds.some(id=>!finding.evidenceIds.includes(id)))fail("INVALID_INPUT","Finding does not support provenance");
    const evidence=edge.sourceEvidenceIds.map(id=>scoped(ctx.db.evidence.id.find(id),args.incidentId,"Evidence"));
    const node=(id:string)=>{
      const asset=ctx.db.assets.id.find(id);if(asset){scoped(asset,args.incidentId,"Asset");return {kind:"ASSET",supported:evidence.some(e=>e.assetIds.includes(id))};}
      const record=ctx.db.evidence.id.find(id);if(record){scoped(record,args.incidentId,"Evidence");return {kind:"EVIDENCE",supported:edge.sourceEvidenceIds.includes(id)};}
      const indicator=ctx.db.indicators.id.find(id);if(indicator){scoped(indicator,args.incidentId,"Indicator");return {kind:"INDICATOR",supported:edge.sourceEvidenceIds.some(id=>indicator.evidenceIds.includes(id))};}
      const proposal=ctx.db.proposals.id.find(id);if(proposal){scoped(proposal,args.incidentId,"Action");return {kind:"PROPOSAL",supported:edge.sourceEvidenceIds.every(id=>proposal.evidenceIds.includes(id))};}
      fail("INVALID_INPUT","Unsupported endpoint");
    };
    const from=node(edge.fromId),to=node(edge.toId);
    const allowed:Record<string,string[]>={OBSERVED_ON:["EVIDENCE:ASSET","INDICATOR:ASSET"],INDICATES:["EVIDENCE:INDICATOR"],AFFECTS:["EVIDENCE:ASSET","INDICATOR:ASSET","ASSET:ASSET"],SUPPORTED_BY:["ASSET:EVIDENCE","INDICATOR:EVIDENCE","PROPOSAL:EVIDENCE"],TARGETS:["PROPOSAL:ASSET"],MITIGATES:["PROPOSAL:ASSET"]};
    if(!from.supported||!to.supported||!allowed[edge.type]?.includes(`${from.kind}:${to.kind}`))fail("INVALID_INPUT","Evidence does not support typed endpoints");
    if(["TARGETS","MITIGATES"].includes(edge.type)){
      const proposal=scoped(ctx.db.proposals.id.find(edge.fromId),args.incidentId,"Action");
      if(!proposal.action.targetIds.includes(edge.toId))fail("INVALID_INPUT","Action does not target endpoint");
      if(edge.type==="MITIGATES" && (proposal.status!=="VERIFIED_SUCCESS" || ![...ctx.db.verifications.iter()].some(v=>v.incidentId===args.incidentId && v.proposalId===proposal.id && v.status==="VERIFIED_SUCCESS")))fail("INVALID_TRANSITION","Verified synthetic action required");
    }
  }else if(args.findingId){scoped(ctx.db.findings.id.find(args.findingId),args.incidentId,"Finding");}
  const id=uid(ctx,"edge-review");
  ctx.db.graphReviews.insert({id,incidentId:args.incidentId,edgeId:edge.id,findingId:args.findingId,decision:args.decision,expectedEdgeDigest:packet.expectedEdgeDigest,evidenceRefsJson:canonical(packet.evidenceRefs),reviewedBy:actor.id,createdAt:iso(ctx)});
  ctx.db.graphEdges.id.update({...edge,verificationStatus:args.decision});return id;
},true));
export const scopedGraphReviews=db.view({name:"scoped_graph_reviews",public:true},{lease:t.string()},t.array(tables.graphReviews.rowType),(ctx,{lease})=>{const ids=visibleIds(ctx,lease);return [...ctx.db.graphReviews.iter()].filter(r=>ids.has(r.incidentId));});
export const linkGraphEdge = db.reducer(
  {
    ...scopedMeta,
    fromId: t.string(),
    toId: t.string(),
    type: t.string(),
    sourceEvidenceIds: t.array(t.string()),
    confidence: t.string(),
  },
  (ctx, args) =>
    command(
      ctx,
      "linkGraphEdge",
      args,
      args.incidentId,
      "ATTACH_EVIDENCE",
      (actor) => {
        oneOf(
          args.type,
          [
            "OBSERVED_ON",
            "INDICATES",
            "AFFECTS",
            "SUPPORTED_BY",
            "TARGETS",
            "MITIGATES",
          ],
          "edge type",
        );
        oneOf(args.confidence, ["LOW", "MEDIUM", "HIGH"], "confidence");
        const node = (id: string) =>
          ctx.db.assets.id.find(id) ??
          ctx.db.evidence.id.find(id) ??
          ctx.db.indicators.id.find(id) ??
          ctx.db.proposals.id.find(id);
        scoped(node(args.fromId), args.incidentId, "Source");
        scoped(node(args.toId), args.incidentId, "Target");
        citations(ctx, args.incidentId, args.sourceEvidenceIds);
        if (!args.sourceEvidenceIds.length)
          fail("INVALID_INPUT", "Edge requires evidence");
        const id = uid(ctx, "edge");
        ctx.db.graphEdges.insert({
          id,
          incidentId: args.incidentId,
          fromId: args.fromId,
          toId: args.toId,
          type: args.type,
          sourceEvidenceIds: args.sourceEvidenceIds,
          assertedBy: actor.id,
          confidence: args.confidence,
          verificationStatus: "HYPOTHESIS",
          createdAt: iso(ctx),
          enabled: true,
          credentialId: undefined,
        });
        return id;
      },
    ),
);
const SessionInfo = t.row("SessionInfoRow", {
  id: t.string().primaryKey(),
  expiresAt: t.f64(),
  issuedAt: t.f64(),
  authenticatedAt: t.f64(),
});
export const mySessions = db.view(
  { name: "my_sessions", public: true },
  t.array(SessionInfo),
  (ctx) => {
    const actor = readUser(ctx);
    return actor
      ? [...ctx.db.sessions.identity.filter(ctx.sender)].map((s) => ({
          id: s.id,
          expiresAt: s.expiresAt,
          issuedAt: s.issuedAt,
          authenticatedAt: s.authenticatedAt,
        }))
      : [];
  },
);
export const expireLease = db.reducer(
  { onSchedule: tables.leaseExpiry },
  { timer: tables.leaseExpiry.rowType },
  (ctx, { timer }) => {
    if (!ctx.senderAuth.isInternal) fail("FORBIDDEN", "Scheduler only");
    ctx.db.readLeases.id.delete(timer.leaseId);
  },
);
const LeaseResult = t.object("LeaseResult", { expiresAt: t.f64() });
export const openReadSession = db.procedure(
  { lease: t.string(), token: t.string() },
  LeaseResult,
  (ctx, args) => {
    if (!/^[a-f0-9]{64}$/.test(args.lease) || args.token.length > 16000)
      fail("INVALID_INPUT", "Invalid read-session request");
    const claims = ctx.withTx((tx) => {
      const actor = user(tx, false, true);
      if (
        !tx.connectionId ||
        [...tx.db.readLeases.sessionId.filter(tx.connectionId.toHexString())]
          .length >= 4 ||
        [...tx.db.readLeases.userId.filter(actor.id)].length >= 32
      )
        fail("RATE_LIMITED", "Too many active read sessions");
      return tx.senderAuth.jwt;
    });
    if (
      !claims ||
      claims.issuer !== ctx.env.OIDC_ISSUER ||
      !claims.audience.includes(ctx.env.OIDC_AUDIENCE)
    )
      fail("UNAUTHENTICATED", "Independent OIDC required");
    const target = ctx.env.AUTH_VALIDATION_URL;
    if (
      !/^https:\/\/[^\/@?#]+\/api\/auth\/validate$/.test(target) &&
      !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/api\/auth\/validate$/.test(
        target,
      )
    )
      fail(
        "DEPENDENCY_UNAVAILABLE",
        "Trusted TLS auth validation endpoint required",
      );
    const response = ctx.http.fetch(target, {
      method: "POST",
      headers: { Authorization: `Bearer ${args.token}` },
    });
    if (response.status !== 200)
      fail("UNAUTHENTICATED", "Original OIDC token rejected");
    let verified: {
      issuer: string;
      subject: string;
      audience: string;
      sessionId: string;
      expiresAt: number;
      authenticatedAt: number;
      originalIssuedAt: number;
    };
    try {
      verified = JSON.parse(response.text());
    } catch {
      fail("UNAUTHENTICATED", "Invalid authentication validation response");
    }
    if (
      verified.issuer !== claims.issuer ||
      verified.subject !== claims.subject ||
      verified.audience !== ctx.env.OIDC_AUDIENCE ||
      !Number.isFinite(verified.expiresAt) ||
      !Number.isFinite(verified.authenticatedAt) ||
      verified.sessionId !== claims.fullPayload.sid ||
      !Number.isFinite(verified.originalIssuedAt)
    )
      fail("UNAUTHENTICATED", "Original OIDC identity mismatch");
    return ctx.withTx((tx) => {
      const actor = user(tx, false, true);
      if (!tx.connectionId) fail("UNAUTHENTICATED", "Connection required");
      const expiresAt = Math.min(verified.expiresAt, seconds(tx) + 900);
      if (
        expiresAt <= seconds(tx) ||
        verified.originalIssuedAt <= actor.revokedBefore ||
        tx.db.revokedSessions.id.find(verified.sessionId)
      )
        fail("UNAUTHENTICATED", "Original OIDC session expired or revoked");
      let policy: ReturnType<typeof bootstrapPolicy>;
      try { policy = bootstrapPolicy(verified.subject,tx.env.BOOTSTRAP_COMMANDER_SUBJECTS,tx.env.SERVICE_SUBJECTS ?? "",actor); }
      catch { fail("UNAUTHENTICATED", "Configured human/service identity conflict"); }
      if (policy.promote) {
        tx.db.users.id.update({...actor,platformAdmin:true});
        audit(tx,actor.id,"","bootstrapCommander",actor.id,`bootstrap:${actor.id}`,"Explicit configured human bootstrap after original session validation; no incident grants");
      }
      const id = sha256(args.lease);
      if (tx.db.readLeases.id.find(id))
        fail("INVALID_INPUT", "Lease handle already used");
      tx.db.readLeases.insert({
        id,
        userId: actor.id,
        sessionId: tx.connectionId.toHexString(),
        expiresAt,
        authenticatedAt: verified.authenticatedAt,
        clerkSessionId: verified.sessionId,
        originalIssuedAt: verified.originalIssuedAt,
      });
      tx.db.leaseExpiry.insert({
        scheduledId: 0n,
        scheduledAt: ScheduleAt.time(BigInt(Math.floor(expiresAt * 1e6))),
        leaseId: id,
      });
      return { expiresAt };
    });
  },
);
