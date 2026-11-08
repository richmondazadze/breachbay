import type { IncidentSnapshot, ActionStatusRead } from '../contracts';
import { sanitizeFreeText } from '../ai/evidence';
import { validateActionStatus } from '../ai/action-status';
/** Snapshot must come from a fresh active scoped subscription; no broad table scans or raw fields. */
export function actionStatusFromSnapshot(snapshot:IncidentSnapshot,incidentId:string,actionId:string):ActionStatusRead {
 if(snapshot.incident.id!==incidentId)throw new Error('FORBIDDEN');
 const proposal=snapshot.proposals.find(p=>p.incidentId===incidentId&&p.id===actionId);
 if(!proposal)throw new Error('FORBIDDEN');
 const verification=snapshot.verifications.filter(v=>v.incidentId===incidentId&&v.proposalId===actionId).sort((a,b)=>b.observedVersion-a.observedVersion)[0];
 return validateActionStatus({incidentId,actionId,status:proposal.status,version:proposal.version,expectedVersion:proposal.expectedVersion,...(verification?{verification:{status:verification.status,observedVersion:verification.observedVersion,summary:sanitizeFreeText(verification.summary).slice(0,1000)}}:{})},incidentId,actionId);
}
