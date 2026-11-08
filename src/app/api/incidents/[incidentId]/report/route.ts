import { authenticatedBackend } from "../../../../../lib/backend/server";
import { enforceOrigin, AuthError } from "../../../../../lib/backend/oidc";
import { executeCommand } from "../../../../../lib/backend/client";
import { boundedBody, commandMeta, commandResponse, endpointFailure, requireScope } from "../../../../../lib/backend/endpoint";
export const runtime="nodejs";
export async function POST(request:Request,context:{params:Promise<{incidentId:string}>}) {
 let conn:Awaited<ReturnType<typeof authenticatedBackend>>["conn"]|undefined;
 try {
  enforceOrigin(request); const auth=await authenticatedBackend(request);conn=auth.conn;
  const {incidentId}=await context.params;
  requireScope(conn,incidentId,auth.session.user.id,"EXPORT");
  let input:Record<string,unknown>;try{input=JSON.parse((await boundedBody(request,4096)).toString());}catch{throw new Error("INVALID_INPUT");}
  const meta=commandMeta(input);
  if(meta.expectedVersion !== undefined) throw new Error("INVALID_INPUT");
  const result=await executeCommand(conn,meta,()=>conn!.reducers.exportReport({...meta,incidentId}));
  if(!result.ok)return commandResponse(result);
  requireScope(conn,incidentId,auth.session.user.id,"EXPORT");
  const report=[...conn.db.scopedReports.iter()].find(r=>r.id===result.data.id);
  if(!report)throw new AuthError("DEPENDENCY_UNAVAILABLE","Report receipt confirmed but download unavailable; retry same key");
  return new Response(JSON.stringify({...report,summary:JSON.parse(report.summary)},null,2),{headers:{"Content-Type":"application/json; charset=utf-8","Content-Disposition":"attachment; filename=breachbay-report.json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","X-Correlation-Id":meta.correlationId}});
 }catch(error){return endpointFailure(error);}finally{conn?.disconnect();}
}
