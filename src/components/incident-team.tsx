"use client";
import { useState } from "react";
import type {
  IncidentSnapshot,
  IncidentRole,
  CommandResult,
} from "@/lib/contracts";
import type { IncidentClient } from "@/hooks/use-incident";
import { AcknowledgeControl } from "./incident-operations";
import { Button } from "./ui/button";
const roles: IncidentRole[] = [
  "COMMANDER",
  "INVESTIGATOR",
  "RESPONDER",
  "OBSERVER",
  "AI_SERVICE",
];
export function IncidentTeam({
  snapshot: s,
  client,
  disabled,
  canManage,
  command,
  userId,
}: {
  snapshot: IncidentSnapshot;
  client: IncidentClient;
  disabled: boolean;
  canManage: boolean;
  userId?: string;
  command: (
    run: () => Promise<CommandResult<{ id: string }>>,
  ) => Promise<boolean>;
}) {
  const [subject, setSubject] = useState("");
  const [role, setRole] = useState<IncidentRole>("RESPONDER");
  const [taskTitle, setTaskTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [grantUser, setGrantUser] = useState("");
  const [grantRole, setGrantRole] = useState<IncidentRole>("RESPONDER");
  const meta = () => ({
    incidentId: s.incident.id,
    idempotencyKey: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
  });
  return (
    <div className="team-workflows">
      <section className="panel decision-body">
        <h2>Incident tasks</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await command(() =>
                client.assignTask({
                  ...meta(),
                  title: taskTitle,
                  assigneeId: assignee || undefined,
                  state: "TODO",
                }),
              )
            )
              setTaskTitle("");
          }}
        >
          <label className="field-label">
            Task title
            <input
              required
              maxLength={200}
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
            />
          </label>
          <label className="field-label">
            Assign to
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              <option value="">Unassigned</option>
              {s.memberships
                .filter((m) => m.active && m.role !== "AI_SERVICE")
                .map((m) => (
                  <option value={m.userId} key={m.id}>
                    {m.userId} · {m.role}
                  </option>
                ))}
            </select>
          </label>
          <Button disabled={disabled || !taskTitle.trim()}>Add task</Button>
        </form>
        {s.tasks.map((t) => (
          <div className="task-editor" key={t.id}>
            <strong>{t.title}</strong>
            <AcknowledgeControl snapshot={s} objectId={t.id} userId={userId} client={client} disabled={disabled} command={command} />
            <label className="field-label">
              Assignee
              <select
                aria-label={`Assignee for ${t.title}`}
                value={t.assigneeId ?? ""}
                disabled={disabled}
                onChange={(e) =>
                  void command(() =>
                    client.assignTask({
                      ...meta(),
                      taskId: t.id,
                      title: t.title,
                      assigneeId: e.target.value || undefined,
                      state: t.state,
                      expectedVersion: t.version,
                    }),
                  )
                }
              >
                <option value="">Unassigned</option>
                {s.memberships
                  .filter((m) => m.active && m.role !== "AI_SERVICE")
                  .map((m) => (
                    <option value={m.userId} key={m.id}>
                      {m.userId}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field-label">
              State
              <select
                value={t.state}
                disabled={disabled}
                aria-label={`State for ${t.title}`}
                onChange={(e) =>
                  void command(() =>
                    client.assignTask({
                      ...meta(),
                      taskId: t.id,
                      title: t.title,
                      assigneeId: t.assigneeId,
                      state: e.target.value as typeof t.state,
                      expectedVersion: t.version,
                    }),
                  )
                }
              >
                <option value="TODO">To do</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="DONE">Done</option>
              </select>
            </label>
          </div>
        ))}
      </section>
      <section className="panel decision-body">
        <h2>Scoped membership</h2>
        {s.memberships.map((m) => (
          <div className="membership-row" key={m.id}>
            <code>{m.userId}</code>
            <span className="state-chip">
              {m.role} · {m.active ? "Active" : "Revoked"}
            </span>
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() =>
                  void command(() =>
                    client.setMember({
                      ...meta(),
                      userId: m.userId,
                      role: m.role,
                      active: !m.active,
                    }),
                  )
                }
              >
                {m.active ? "Revoke" : "Restore"}
              </Button>
            )}
          </div>
        ))}
        {canManage ? (
          <>
            <h3>Invite a dedicated responder</h3>
            <p className="small">
              Enter their Clerk user subject. Invitations grant access only
              after acceptance.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await command(() =>
                    client.inviteMember({
                      ...meta(),
                      targetSubject: subject.trim(),
                      role,
                    }),
                  )
                )
                  setSubject("");
              }}
            >
              <label className="field-label">
                Clerk user subject
                <input
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="user_…"
                />
              </label>
              <label className="field-label">
                Incident role
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as IncidentRole)}
                >
                  {roles.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              {role === "AI_SERVICE" && (
                <p className="impact-warning">
                  Service identity only. This role can author model traces and
                  proposals; it cannot approve or execute actions.
                </p>
              )}
              <Button disabled={disabled || !subject.trim()}>
                Create invitation
              </Button>
            </form>
            <h3>Change an existing member role</h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await command(() =>
                    client.setMember({
                      ...meta(),
                      userId: grantUser,
                      role: grantRole,
                      active: true,
                    }),
                  )
                )
                  setGrantUser("");
              }}
            >
              <label className="field-label">
                Registered member
                <select
                  required
                  value={grantUser}
                  onChange={(e) => setGrantUser(e.target.value)}
                >
                  <option value="">Select member</option>
                  {s.memberships.map((m) => (
                    <option key={m.id} value={m.userId}>
                      {m.userId}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Role
                <select
                  value={grantRole}
                  onChange={(e) => setGrantRole(e.target.value as IncidentRole)}
                >
                  {roles.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              {grantRole === "AI_SERVICE" && (
                <p className="impact-warning">
                  Grant only to an explicitly configured service identity. No
                  approval authority.
                </p>
              )}
              <Button variant="outline" disabled={disabled || !grantUser}>
                Apply role grant
              </Button>
            </form>
          </>
        ) : (
          <p className="small muted">
            Membership changes require incident management permission.
          </p>
        )}
      </section>
    </div>
  );
}
