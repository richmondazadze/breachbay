import { authenticatedBackend } from "../../../../../../lib/backend/server";
import { requireScope, endpointFailure } from "../../../../../../lib/backend/endpoint";
import { AuthError } from "../../../../../../lib/backend/oidc";
import { completedRunResult } from "../../../../../../lib/backend/investigation-recovery";
export const runtime="nodejs";
/** Read-only recovery: never starts a run or invokes the provider. */
export async function GET(request:Request,context:{params:Promise<{incidentId:string;runId:string}>}) {
 let conn:Awaited<ReturnType<typeof authenticatedBackend>>["conn"]|undefined;
 try {
  const auth=await authenticatedBackend(request);conn=auth.conn;
  const {incidentId,runId}=await context.params;
  const snapshot=requireScope(conn,incidentId,auth.session.user.id,"INVESTIGATE");
  const run=snapshot.investigations.find(r=>r.id===runId && r.incidentId===incidentId);
  if(!run)throw new AuthError("FORBIDDEN","Investigation unavailable");
  const result=completedRunResult(snapshot,runId);
  return Response.json({ok:true,data:{id:runId,runId,status:run.status,...(result?{findings:result.findings,proposalId:result.proposalId,...(result.planning?{planning:result.planning}:{})}:{})},correlationId:crypto.randomUUID()},{headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
 }catch(error){return endpointFailure(error);}finally{conn?.disconnect();}
}
