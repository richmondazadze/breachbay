"use client";
import { useAuth } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import {
  connectBackend,
  executeCommand,
  backendError,
  type DbConnection,
} from "@/lib/backend/client";
import { ConfigurationHealth } from "../configuration-health";
import { LogoutControl } from "./logout-control";
import { AuthenticationRecovery } from "./authentication-recovery";
import { currentConnectionCallback } from "@/hooks/connection-callback";
import { subscriptionFailureMessage } from "@/hooks/subscription-failure";
import { ThemeControl } from "../theme";
import { Button } from "../ui/button";
import type { CommandError, Severity, User } from "@/lib/contracts";
export function ClerkCommand() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)
    return (
      <main className="connected-main">
        <h1>Responder login is not configured</h1>
        <a className="button button-outline" href="/sign-in">
          Sign-in configuration
        </a>
      </main>
    );
  return <CommandList />;
}
function CommandList() {
  const { isLoaded, isSignedIn, getToken, userId, sessionId } = useAuth();
  const [incidents, setIncidents] = useState<
    { id: string; title: string; severity: string; status: string; openTasks: number; myTasks: number; pendingApprovals: number; lastActivity: string }[]
  >([]);
  const [invitations, setInvitations] = useState<
    {
      id: string;
      incidentId: string;
      role: string;
      accepted: boolean;
      expiresAt: number;
    }[]
  >([]);
  const [profile, setProfile] = useState<User | null>(null);
  const [canCreate, setCanCreate] = useState(false);
  const [status, setStatus] = useState("Connecting");
  const [error, setError] = useState("");
  const [authenticationError, setAuthenticationError] = useState<CommandError | null>(null);
  const [receipt, setReceipt] = useState("");
  const [pending, setPending] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("HIGH");
  const current = useRef<DbConnection | undefined>(undefined);
  const busy = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setError("");
    setReceipt("");
    setAuthenticationError(null);
    setIncidents([]);
    setInvitations([]);
    setProfile(null);
    setCanCreate(false);
    if (!isSignedIn) return;
    let active = true;
    let conn: DbConnection | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
      setIncidents([]);
      setInvitations([]);
      setProfile(null);
      setCanCreate(false);
      current.current = undefined;
    };
    const end = () => {
      generation.current++;
      setReceipt("");
      active = false;
      clearTimeout(timer);
      conn?.disconnect();
      clear();
      setStatus("Session ended");
    };
    window.addEventListener("breachbay-session-ending", end);
    const publish = () => {
      if (!active || !conn) return;
      const profile = [...conn.db.myProfile.iter()][0];
      if (!profile || profile.status !== "ACTIVE") {
        clear();
        setStatus("Account access unavailable");
        return;
      }
      setProfile(profile as User);
      const tasks = [...conn.db.scopedTasks.iter()];
      const proposals = [...conn.db.scopedProposals.iter()];
      const audits = [...conn.db.scopedAuditEvents.iter()];
      setIncidents([...conn.db.scopedIncidents.iter()].map(incident => {
        const openTasks = tasks.filter(t=>t.incidentId===incident.id && t.state!=="DONE");
        const recordedTimes = [incident.updatedAt,...audits.filter(a=>a.incidentId===incident.id).map(a=>a.createdAt)];
        return {...incident,openTasks:openTasks.length,myTasks:openTasks.filter(t=>t.assigneeId===profile.id).length,pendingApprovals:proposals.filter(p=>p.incidentId===incident.id && p.status==="PENDING_APPROVAL").length,lastActivity:recordedTimes.sort().at(-1) || incident.updatedAt};
      }));
      setInvitations([...conn.db.myInvitations.iter()]);
      setCanCreate(
        profile.platformAdmin ||
          [...conn.db.scopedMemberships.iter()].some(
            (m) =>
              m.active && m.userId === profile.id && m.role === "COMMANDER",
          ),
      );
      setStatus("Server-confirmed scoped incidents");
    };
    async function connect() {
      if (!active) return;
      setStatus(conn ? "Reconnecting" : "Connecting");
      try {
        const token = await getToken({
          skipCache: true,
          ...(process.env.NEXT_PUBLIC_CLERK_JWT_TEMPLATE
            ? { template: process.env.NEXT_PUBLIC_CLERK_JWT_TEMPLATE }
            : {}),
        });
        if (!active) return;
        const endpoint = process.env.NEXT_PUBLIC_SPACETIMEDB_ENDPOINT;
        const database = process.env.NEXT_PUBLIC_SPACETIMEDB_DATABASE;
        if (!token || !endpoint || !database) {
          clear();
          setStatus("Authenticated connection is not configured");
          return;
        }
        let established: DbConnection | undefined;
        const next = await connectBackend({
          endpoint,
          database,
          token,
          onChange: currentConnectionCallback(() => active, () => conn, () => established, publish),
          onDisconnect: () => {
            if (active && conn === established) {
              clear();
              setStatus("Disconnected");
              clearTimeout(timer);
              timer = setTimeout(connect, 2000);
            }
          },
        });
        established = next;
        if (!active) {
          next.disconnect();
          return;
        }
        const previous = conn;
        conn = next;
        current.current = next;
        previous?.disconnect();
        publish();
        clearTimeout(timer);
        timer = setTimeout(connect, 40000);
      } catch (error) {
        if (active) {
          clear();
          setStatus("Unable to establish an authenticated database session");
          setError(subscriptionFailureMessage(error));
          timer = setTimeout(connect, 10000);
        }
      }
    }
    void connect();
    return () => {
      generation.current++;
      active = false;
      window.removeEventListener("breachbay-session-ending", end);
      clearTimeout(timer);
      conn?.disconnect();
      current.current = undefined;
    };
  }, [isSignedIn, userId, sessionId, getToken]);
  async function perform(
    operation: (
      conn: DbConnection,
      meta: { idempotencyKey: string; correlationId: string },
    ) => Promise<void>,
  ) {
    if (
      busy.current ||
      !current.current?.isActive ||
      status !== "Server-confirmed scoped incidents"
    )
      return false;
    busy.current = true;
    const startedGeneration = generation.current;
    setPending(true);
    setError("");
    setReceipt("");
    const meta = {
      idempotencyKey: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
    };
    try {
      const conn = current.current;
      const result = await executeCommand(conn, meta, () =>
        operation(conn, meta),
      );
      if (startedGeneration !== generation.current) return false;
      if (!result.ok) {
        if (result.error.code === "UNAUTHENTICATED") setAuthenticationError(result.error);
        setError(
          `${result.error.code}: ${result.error.message} · reference ${result.correlationId}`,
        );
        return false;
      }
      setReceipt(
        `Server accepted operation · audit ${result.auditEventId ?? result.correlationId}`,
      );
      return true;
    } catch (e) {
      if (startedGeneration !== generation.current) return false;
      const err = backendError(e);
      if (err.code === "UNAUTHENTICATED") setAuthenticationError(err);
      setError(
        `${err.code}: ${err.message}. Inspect server state before retrying.`,
      );
      return false;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  if (!isLoaded)
    return (
      <main className="connected-main" role="status">
        Loading session…
      </main>
    );
  if (!isSignedIn)
    return (
      <main className="connected-main">
        <h1>Responder sign in required</h1>
        <a className="button button-primary" href="/sign-in">
          Sign in to BreachBay
        </a>
      </main>
    );
  const disabled =
    pending ||
    !current.current?.isActive ||
    status !== "Server-confirmed scoped incidents";
  return (
    <main className="connected-main">
      <header className="page-heading">
        <div>
          <a className="brand" href="/command">
            <img src="/brand/harbor.svg" width="32" height="32" alt="" />
            BreachBay.
          </a>
          <h1>Mission Control</h1>
          <p role="status">{status}</p>
        </div>
        <div className="workflow-row">
          <ThemeControl />
          <LogoutControl />
        </div>
      </header>
      {error && (
        <p className="workflow-error" role="alert">
          {error}
        </p>
      )}
      {receipt && (
        <p className="teal" role="status">
          {receipt}
        </p>
      )}
      <AuthenticationRecovery error={authenticationError} />
      <ConfigurationHealth />
      <section className="panel">
        <div className="panel-title">
          <h2>Your assigned incidents</h2>
          <Button
            variant="outline"
            disabled={disabled || !canCreate}
            onClick={() => setShowCreate(!showCreate)}
          >
            {showCreate ? "Close incident form" : "Create incident"}
          </Button>
        </div>
        {showCreate && (
          <form
            className="command-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await perform((conn, meta) =>
                  conn.reducers.createIncident({
                    ...meta,
                    title: title.trim(),
                    description: description.trim(),
                    severity,
                    classification: "SYNTHETIC",
                    scenarioId: "credential-compromise",
                  }),
                )
              ) {
                setShowCreate(false);
                setTitle("");
                setDescription("");
              }
            }}
          >
            <label className="field-label">
              Incident title
              <input
                required
                maxLength={160}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="field-label">
              Description
              <textarea
                required
                maxLength={5000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="field-label">
              Severity
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as Severity)}
              >
                {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <p className="small muted">
              Creates the replayable synthetic credential-compromise scenario.
              No production system is changed.
            </p>
            <Button disabled={disabled || !title.trim() || !description.trim()}>
              Create synthetic incident
            </Button>
          </form>
        )}
        <div className="asset-list">
          {incidents.map((i) => (
            <a
              key={i.id}
              className="incident-card"
              href={`/incidents/${encodeURIComponent(i.id)}`}
            >
              <span className="severity-chip">{i.severity}</span>
              <h2>{i.title}</h2>
              <span className="state-chip">{i.status}</span>
              <dl className="mission-projections"><div><dt>Open tasks</dt><dd>{i.openTasks} · {i.myTasks} assigned to you</dd></div><div><dt>Pending approvals</dt><dd>{i.pendingApprovals}</dd></div><div><dt>Last recorded activity</dt><dd><time dateTime={i.lastActivity}>{new Date(i.lastActivity).toLocaleString()}</time></dd></div></dl>
            </a>
          ))}
        </div>
        {!incidents.length && (
          <p className="empty">
            No assigned incidents available. Accept an invitation or request a
            commander grant.
          </p>
        )}
        {!canCreate && profile && (
          <p className="panel-foot">
            Incident creation requires an explicitly authorized commander or
            platform administrator.
          </p>
        )}
      </section>
      <section className="panel" style={{ marginTop: 20 }}>
        <div className="panel-title">
          <h2>Scoped invitations</h2>
        </div>
        <div className="invitation-list">
          {invitations
            .filter((i) => !i.accepted)
            .map((i) => (
              <div key={i.id}>
                <p>
                  <code>{i.incidentId}</code> · {i.role}
                </p>
                <p className="small muted">
                  Expires {new Date(i.expiresAt * 1000).toLocaleString()}
                </p>
                <Button
                  disabled={disabled || i.expiresAt * 1000 <= Date.now()}
                  onClick={() =>
                    void perform((conn, meta) =>
                      conn.reducers.acceptInvitation({
                        ...meta,
                        invitationId: i.id,
                      }),
                    )
                  }
                >
                  Accept invitation
                </Button>
              </div>
            ))}
          {!invitations.some((i) => !i.accepted) && (
            <p className="empty">No pending invitations.</p>
          )}
        </div>
      </section>
      <a className="text-button" href="/">
        Synthetic interface preview →
      </a>
    </main>
  );
}
