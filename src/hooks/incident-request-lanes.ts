export type IncidentRequestLane = "mutation" | "investigation";
export interface IncidentRequestTicket { lane: IncidentRequestLane; generation: number }
/** One long investigation request and one ordinary mutation can coexist.
 * Scope resets invalidate both tickets without letting old completions clear
 * a new request's busy state. */
export function createIncidentRequestLanes() {
  let generation = 0;
  const current: Record<IncidentRequestLane, IncidentRequestTicket | null> = { mutation: null, investigation: null };
  const isCurrent = (ticket: IncidentRequestTicket) => ticket.generation === generation && current[ticket.lane] === ticket;
  return {
    begin(lane: IncidentRequestLane, live: boolean): IncidentRequestTicket | null {
      if (!live || current[lane]) return null;
      const ticket = { lane, generation };
      current[lane] = ticket;
      return ticket;
    },
    isCurrent,
    finish(ticket: IncidentRequestTicket): boolean {
      if (!isCurrent(ticket)) return false;
      current[ticket.lane] = null;
      return true;
    },
    reset() { generation++; current.mutation = null; current.investigation = null; },
  };
}
