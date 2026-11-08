import type {Membership} from "../contracts";
/** Model service gets approved derivatives; raw originals require a current human READ grant. */
export function originalReadAllowed(memberships: Membership[],userId:string) {
 return memberships.some(m=>m.active && m.userId===userId && m.role!=="AI_SERVICE" && m.capabilities.includes("READ")) && !memberships.some(m=>m.active && m.userId===userId && m.role==="AI_SERVICE");
}
