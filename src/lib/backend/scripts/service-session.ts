/** Operator-run only. Never load dotenv, mint via HTTP route, log tickets/JWTs, or create/delete users. */
import {createClerkClient} from "@clerk/backend";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {assertServiceUser,assertServiceSession,writeOperatorArtifact} from "../service-session-operator";
import {verifyIdToken} from "../clerk-token";
export async function runServiceSessionOperator(env:NodeJS.ProcessEnv=process.env) {
 const mode=env.BREACHBAY_SERVICE_SESSION_MODE;
 const userId=env.AI_SERVICE_CLERK_USER_ID;
 const output=env.BREACHBAY_SERVICE_SESSION_OUTPUT;
 if(!["ticket","verify"].includes(mode??"") || !userId || !output || !env.CLERK_SECRET_KEY?.startsWith("sk_live_"))throw new Error("OPERATOR_CONFIGURATION_REQUIRED");
 const origin=new URL(env.APP_ORIGIN ?? "https://breachbay.us");
 if(origin.protocol!=="https:" || origin.username || origin.password || origin.pathname!=="/" || origin.search || origin.hash)throw new Error("TRUSTED_ORIGIN_REQUIRED");
 const client=createClerkClient({secretKey:env.CLERK_SECRET_KEY});
 const user=await client.users.getUser(userId);
 assertServiceUser(user,userId);
 if(mode==="ticket") {
  const ticket=await client.signInTokens.createSignInToken({userId,expiresInSeconds:300});
  if(ticket.userId!==userId || !ticket.token)throw new Error("SERVICE_TICKET_DENIED");
  try {await writeOperatorArtifact(output,{userId,ticketId:ticket.id,ticket:ticket.token,origin:origin.origin,expiresInSeconds:300});}
  catch(error){await client.signInTokens.revokeSignInToken(ticket.id).catch(()=>{});throw error;}
  return;
 }
 let sessionId=env.AI_SERVICE_CLERK_SESSION_ID;
 if(!sessionId){
  const sessions=await client.sessions.getSessionList({userId,status:"active",limit:2});
  if(sessions.totalCount!==1 || sessions.data.length!==1)throw new Error("EXPLICIT_SESSION_REQUIRED");
  sessionId=sessions.data[0].id;
 }
 const session=await client.sessions.getSession(sessionId);
 assertServiceSession(session,userId);
 const token=await client.sessions.getToken(sessionId,env.CLERK_JWT_TEMPLATE,120);
 // Uses existing issuer/audience/origin/signature checks; never invent sid/fva/azp.
 const claims=await verifyIdToken(token.jwt);
 if(claims.sub!==userId || claims.sid!==sessionId)throw new Error("SERVICE_TOKEN_DENIED");
 assertServiceSession(await client.sessions.getSession(sessionId),userId);
 await writeOperatorArtifact(output,{AI_SERVICE_CLERK_USER_ID:userId,AI_SERVICE_CLERK_SESSION_ID:sessionId,verified:true,verifiedAt:new Date().toISOString()});
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
 runServiceSessionOperator().then(()=>{process.stdout.write("Service session operator step completed; private artifact written.\n");}).catch(()=>{process.stderr.write("Service session operator step failed; no credentials emitted. Check configuration, active session/MFA/tasks and protected output path.\n");process.exitCode=1;});
}
