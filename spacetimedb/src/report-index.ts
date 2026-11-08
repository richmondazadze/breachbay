/** Explicit projection prevents raw evidence/storage fields from entering exported index metadata. */
export function evidenceIndex(items: readonly {id:string;version:number;source:string;capturedAt:string;classification:string;sha256:string;redactedSha256:string}[]) {
 return items.map(e=>({id:e.id,version:e.version,source:e.source,capturedAt:e.capturedAt,classification:e.classification,sha256:e.sha256,redactedSha256:e.redactedSha256}));
}
export function actionIndex(items: readonly {id:string;version:number;status:string;action:{type:string;targetIds:string[]};rationale:string;expectedVersion:number;planningJson?:string;investigationId?:string;requestedBy:string;createdAt:string}[]) {
 return items.map(p=>({id:p.id,version:p.version,status:p.status,type:p.action.type,targetIds:p.action.targetIds,rationale:p.rationale,expectedVersion:p.expectedVersion,...(p.planningJson?{planning:JSON.parse(p.planningJson)}:{}),investigationId:p.investigationId,requestedBy:p.requestedBy,createdAt:p.createdAt}));
}
