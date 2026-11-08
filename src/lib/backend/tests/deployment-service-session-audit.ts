/** Read-only deployed helper audit. Synthetic API ports and private temporary files only. */
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile,lstat,open,realpath,mkdtemp,mkdir,writeFile,stat,symlink,rm} from "node:fs/promises";
import {constants} from "node:fs";
import {dirname,resolve,join} from "node:path";
import {tmpdir} from "node:os";
import {runInNewContext} from "node:vm";
const helperPath=new URL("../../../../deployment/establish-service-session.mjs",import.meta.url);
async function source() {return (await readFile(helperPath,"utf8")).replace(/^import .*;\n/gm,"").replace(/\nmain\(\)\.catch[\s\S]*$/,"");}
async function harness(signIn:Record<string,unknown>,options:{active?:boolean;foreign?:boolean;reuse?:boolean}={}) {
 const calls={revokedSessions:[] as string[],revokedTickets:[] as string[],writes:0};
 const user={id:"service-test",externalId:"breachbay-investigation-service",banned:false,locked:false};
 const client={users:{getUserList:async()=>({totalCount:1,data:[user]})},sessions:{getSessionList:async()=>({totalCount:0,data:[]}),getSession:async()=>({status:options.active===false?"pending":"active",userId:options.foreign?"other-user":user.id}),getToken:async()=>({jwt:"synthetic-only"}),revokeSession:async(id:string)=>{calls.revokedSessions.push(id);}},signInTokens:{createSignInToken:async()=>({id:"ticket-test",token:"synthetic-ticket"}),revokeSignInToken:async(id:string)=>{calls.revokedTickets.push(id);}}};
 const main=runInNewContext(await source()+"\nappendProtected=recordWrite; main",{recordWrite:async()=>{calls.writes++;},createClerkClient:()=>client,createRemoteJWKSet:()=>({}),jwtVerify:async()=>({payload:{sub:user.id,sid:"sess_Test1",azp:"https://breachbay.us"}}),process:{env:{CLERK_ISSUER_URL:"https://clerk.breachbay.us",APP_ORIGIN:"https://breachbay.us",CLERK_SECRET_KEY:"sk_live_synthetic",BREACHBAY_SERVICE_ENV_PATH:"/synthetic/private/env",...(options.reuse?{AI_SERVICE_CLERK_USER_ID:user.id,AI_SERVICE_CLERK_SESSION_ID:"sess_Test1"}:{})}},fetch:async()=>({ok:true,json:async()=>({response:signIn})}),URL,URLSearchParams,AbortSignal,console:{log:()=>{}}}) as ()=>Promise<void>;
 return {main,calls};
}
test("success verifies binding, writes once and revokes ticket",async()=>{
 const {main,calls}=await harness({status:"complete",created_session_id:"sess_Test1"});await main();assert.equal(calls.writes,1);assert.deepEqual(calls.revokedTickets,["ticket-test"]);assert.deepEqual(calls.revokedSessions,[]);
});
test("new session active-check failure and incomplete candidate both revoke owned session",async()=>{
 for(const [signIn,options] of [[{status:"complete",created_session_id:"sess_Test1"},{active:false}],[{status:"needs_second_factor",created_session_id:"sess_Test1"},{}]] as const) {
 const {main,calls}=await harness(signIn,options);await assert.rejects(main);assert.equal(calls.writes,0);assert.deepEqual(calls.revokedSessions,["sess_Test1"]);assert.deepEqual(calls.revokedTickets,["ticket-test"]);
 }
});
test("failure preserves foreign candidate and reused existing sessions",async()=>{
 for(const options of [{foreign:true},{reuse:true,active:false}]){
 const {main,calls}=await harness({status:"complete",created_session_id:"sess_Test1"},options);await assert.rejects(main);assert.equal(calls.writes,0);assert.deepEqual(calls.revokedSessions,[]);
 }
});
test("protected append enforces 0600 and rejects symlink/nonregular/writable-parent paths",async()=>{
 const append=runInNewContext(await source()+"\nappendProtected",{lstat,open,realpath,constants,dirname,resolve,process:{getuid:()=>process.getuid!()}}) as (path:string,text:string)=>Promise<void>;
 const root=await realpath(await mkdtemp(join(tmpdir(),"breachbay-append-audit-")));
 try {
 const parent=join(root,"private");await mkdir(parent,{mode:0o700});const file=join(parent,"env");await writeFile(file,"synthetic-before",{mode:0o644});
 await append(file,"\nsynthetic-after");assert.equal((await stat(file)).mode & 0o777,0o600);assert.equal(await readFile(file,"utf8"),"synthetic-before\nsynthetic-after");
 const link=join(parent,"link");await symlink(file,link);await assert.rejects(append(link,"rejected"));await assert.rejects(append(parent,"rejected"));
 const writable=join(root,"writable");await mkdir(writable,{mode:0o777});const writableFile=join(writable,"env");await writeFile(writableFile,"synthetic");
 // Explicit chmod defeats umask so the rejection condition is tested.
 const {chmod}=await import("node:fs/promises");await chmod(writable,0o777);await assert.rejects(append(writableFile,"rejected"),/PRIVATE_ENV_PARENT_REQUIRED/);
 const linkedParent=join(root,"linked-parent");await symlink(parent,linkedParent);await assert.rejects(append(join(linkedParent,"env"),"rejected"),/ENV_PARENT_SYMLINK_DENIED/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test("protected append rejects file owner mismatch before opening",async()=>{
 let opened=false;
 const append=runInNewContext(await source()+"\nappendProtected",{lstat:async(path:string)=>path.endsWith("env")?{isFile:()=>true,isSymbolicLink:()=>false,uid:42}:{isDirectory:()=>true,mode:0o700},open:async()=>{opened=true;},realpath:async(path:string)=>path,constants,dirname,resolve,process:{getuid:()=>43}}) as (path:string,text:string)=>Promise<void>;
 await assert.rejects(append("/synthetic/private/env","rejected"),/PRIVATE_ENV_FILE_REQUIRED/);assert.equal(opened,false);
});
test("protected append rejects inode/device change after open and closes without writing",async()=>{
 for(const actual of [{ino:2,dev:1},{ino:1,dev:2}]) {
 let wrote=false,closed=false;
 const append=runInNewContext(await source()+"\nappendProtected",{lstat:async(path:string)=>path.endsWith("env")?{isFile:()=>true,isSymbolicLink:()=>false,uid:43,ino:1,dev:1}:{isDirectory:()=>true,mode:0o700},open:async()=>({stat:async()=>({...actual,isFile:()=>true}),chmod:async()=>{wrote=true;},writeFile:async()=>{wrote=true;},sync:async()=>{},close:async()=>{closed=true;}}),realpath:async(path:string)=>path,constants,dirname,resolve,process:{getuid:()=>43}}) as (path:string,text:string)=>Promise<void>;
 await assert.rejects(append("/synthetic/private/env","rejected"),/ENV_FILE_CHANGED/);assert.equal(wrote,false);assert.equal(closed,true);
 }
});
