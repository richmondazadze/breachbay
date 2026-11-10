import { authenticatedBackend } from "../../../../../lib/backend/server";
import { AuthError, validateActiveClerkSession } from "../../../../../lib/backend/oidc";
import { requireScope, endpointFailure } from "../../../../../lib/backend/endpoint";
import { readOriginal } from "../../../../../lib/backend/evidence-storage";
import { originalReadAllowed } from "../../../../../lib/backend/evidence-access";
export const runtime="nodejs";
export async function GET(request: Request, context:{params:Promise<{evidenceId:string}>}) {
  let conn:Awaited<ReturnType<typeof authenticatedBackend>>["conn"]|undefined;
  try {
    const auth=await authenticatedBackend(request); conn=auth.conn;
    const {evidenceId}=await context.params;
    const evidence=[...conn.db.scopedEvidence.iter()].find(e=>e.id===evidenceId);
    if(!evidence) throw new AuthError("FORBIDDEN","Original evidence unavailable");
    const snapshot=requireScope(conn,evidence.incidentId,auth.session.user.id,"READ");
    if(!originalReadAllowed(snapshot.memberships,auth.session.user.id)) throw new AuthError("FORBIDDEN","AI service cannot read original evidence");
    const root=process.env.EVIDENCE_STORAGE_DIR;
    if(!root) throw new AuthError("DEPENDENCY_UNAVAILABLE","Private evidence storage is not configured");
    const bytes=await readOriginal(root,evidence.incidentId,evidence.sha256);
    await validateActiveClerkSession(auth.credentials.idToken);
    requireScope(conn,evidence.incidentId,auth.session.user.id,"READ");
    return new Response(new Uint8Array(bytes),{headers:{"Content-Type":"application/octet-stream","Content-Disposition":`attachment; filename=${evidence.classification === "SYNTHETIC" ? "synthetic-evidence.bin" : "original-evidence.bin"}`,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  }catch(error){return endpointFailure(error);}finally{conn?.disconnect();}
}
