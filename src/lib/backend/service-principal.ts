export const SERVICE_EXTERNAL_ID = "breachbay-investigation-service";
export function assertServiceUser(user: { id: string; externalId: string | null; banned: boolean; locked: boolean }, userId: string) {
  if (user.id !== userId || user.externalId !== SERVICE_EXTERNAL_ID || user.banned || user.locked) throw new Error("SERVICE_USER_DENIED");
}
export function assertServiceSession(session: { userId: string; status: string }, userId: string) {
  if (session.userId !== userId || session.status !== "active") throw new Error("SERVICE_SESSION_DENIED");
}
