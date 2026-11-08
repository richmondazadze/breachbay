import type { AssignTaskCommand, CommandMeta, Role } from "../contracts";
import { executeCommand, type DbConnection } from "./client";
/** Thin adapters: authority and validation remain transactional in Spacetime. */
export function assignTask(conn: DbConnection, command: AssignTaskCommand) {
  return executeCommand(conn, command, () => conn.reducers.assignTask(command));
}
export function inviteMember(conn: DbConnection, command: CommandMeta & {incidentId:string;targetSubject:string;role:Role}) {
  return executeCommand(conn, command, () => conn.reducers.inviteMember(command));
}
export function acceptInvitation(conn: DbConnection, command: CommandMeta & {invitationId:string}) {
  return executeCommand(conn, command, () => conn.reducers.acceptInvitation(command));
}
export function setMember(conn: DbConnection, command: CommandMeta & {incidentId:string;userId:string;role:Role;active:boolean}) {
  return executeCommand(conn, command, () => conn.reducers.setMember(command));
}
