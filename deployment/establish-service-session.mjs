import { createClerkClient } from '@clerk/backend';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { lstat, open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
async function appendProtected(path,text){
 if(!path || !path.startsWith('/')) throw new Error('PRIVATE_ENV_REQUIRED');
 const parent=dirname(path);
 if(await realpath(parent)!==resolve(parent)) throw new Error('ENV_PARENT_SYMLINK_DENIED');
 const directory=await lstat(parent);
 if(!directory.isDirectory() || (directory.mode & 0o022)) throw new Error('PRIVATE_ENV_PARENT_REQUIRED');
 const before=await lstat(path);
 if(!before.isFile() || before.isSymbolicLink() || before.uid!==process.getuid()) throw new Error('PRIVATE_ENV_FILE_REQUIRED');
 const handle=await open(path,constants.O_WRONLY|constants.O_APPEND|constants.O_NOFOLLOW);
 try{const actual=await handle.stat();if(!actual.isFile() || actual.ino!==before.ino || actual.dev!==before.dev) throw new Error('ENV_FILE_CHANGED');await handle.chmod(0o600);await handle.writeFile(text);await handle.sync();}finally{await handle.close();}
}
async function main(){
  const issuer=process.env.CLERK_ISSUER_URL;
  const origin=process.env.APP_ORIGIN;
  if(issuer!=='https://clerk.breachbay.us' || origin!=='https://breachbay.us' || !process.env.CLERK_SECRET_KEY?.startsWith('sk_live_') || !process.env.BREACHBAY_SERVICE_ENV_PATH) throw new Error('CONFIGURATION_REQUIRED');
  const client=createClerkClient({secretKey:process.env.CLERK_SECRET_KEY});
  const users=await client.users.getUserList({externalId:['breachbay-investigation-service'],limit:2});
  if(users.totalCount!==1 || users.data.length!==1) throw new Error('EXACT_SERVICE_USER_REQUIRED');
  const user=users.data[0];
  if(user.banned || user.locked || user.externalId!=='breachbay-investigation-service') throw new Error('SERVICE_USER_DENIED');
  let sessionId=process.env.AI_SERVICE_CLERK_USER_ID===user.id ? process.env.AI_SERVICE_CLERK_SESSION_ID : undefined;
  if(!sessionId){
    const prior=await client.sessions.getSessionList({userId:user.id,status:'active',limit:2});
    if(prior.totalCount>1) throw new Error('EXPLICIT_SESSION_REQUIRED');
    if(prior.totalCount===1) sessionId=prior.data[0].id;
  }
  let issuedTicket, createdSessionId;
  try {
    if(!sessionId){
      issuedTicket=await client.signInTokens.createSignInToken({userId:user.id,expiresInSeconds:300});
      const response=await fetch(issuer+'/v1/client/sign_ins',{
        method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({strategy:'ticket',ticket:issuedTicket.token}),signal:AbortSignal.timeout(20000)
      });
      const data=await response.json();
      if(!response.ok) throw new Error('TICKET_REDEMPTION_DENIED_'+response.status+'_'+(data.errors?.[0]?.code??'unknown'));
      const signIn=data.response;
      if(typeof signIn?.created_session_id==='string' && /^sess_[A-Za-z0-9]+$/.test(signIn.created_session_id)) createdSessionId=signIn.created_session_id;
      if(signIn?.status!=='complete' || typeof signIn.created_session_id!=='string') throw new Error('INTERACTIVE_FACTOR_OR_SESSION_TASK_REQUIRED');
      createdSessionId=signIn.created_session_id;
      sessionId=createdSessionId;
    }
    const session=await client.sessions.getSession(sessionId);
    if(session.status!=='active' || session.userId!==user.id) throw new Error('ACTIVE_SERVICE_SESSION_REQUIRED');
    const token=await client.sessions.getToken(sessionId,undefined,120);
    const {payload}=await jwtVerify(token.jwt,createRemoteJWKSet(new URL(issuer+'/.well-known/jwks.json')),{issuer,audience:'breachbay.us',algorithms:['RS256','ES256'],requiredClaims:['sub','sid','exp','iat']});
    if(payload.sub!==user.id || payload.sid!==sessionId || (payload.azp!==undefined && payload.azp!==origin)) throw new Error('SERVICE_TOKEN_BINDING_DENIED');
    const check=await client.sessions.getSession(sessionId);
    if(check.status!=='active' || check.userId!==user.id) throw new Error('SERVICE_SESSION_REVOKED');
    await appendProtected(process.env.BREACHBAY_SERVICE_ENV_PATH,`\nAI_SERVICE_CLERK_USER_ID=${user.id}\nAI_SERVICE_CLERK_SESSION_ID=${sessionId}\n`);
    console.log('PASS: actual production service ticket redemption, active Clerk session, signed audience/issuer/subject binding; no incident grant');
  }catch(error){
    if(createdSessionId){const failed=await client.sessions.getSession(createdSessionId).catch(()=>undefined);if(failed?.userId===user.id) await client.sessions.revokeSession(createdSessionId).catch(()=>{});}
    throw error;
  }finally{
    if(issuedTicket) await client.signInTokens.revokeSignInToken(issuedTicket.id).catch(()=>{});
  }
}
main().catch(error=>{console.error(error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)?error.message:'SERVICE_SESSION_FAILED');process.exitCode=1;});
