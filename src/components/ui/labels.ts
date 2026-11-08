const actionLabels: Record<string, string> = {
  ISOLATE_SIMULATED_HOST: "Isolate a host",
  BLOCK_SIMULATED_ROUTE: "Block a communication route",
  RESET_SIMULATED_CREDENTIAL: "Reset an attributed credential",
};
export function displayLabel(value: string) {
  return actionLabels[value] ?? value.toLowerCase().replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase());
}

export function responderLabel(userId: string, memberships: ReadonlyArray<{ userId: string; role: string }>, currentUserId?: string) {
  const member = memberships.find(m => m.userId === userId);
  const role = member ? displayLabel(member.role) : "Responder";
  return userId === currentUserId ? `You · ${role}` : `${role} · ${userId.slice(-8)}`;
}
