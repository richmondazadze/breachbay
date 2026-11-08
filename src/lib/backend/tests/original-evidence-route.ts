/** Actual route control flow with synthetic auth/storage ports; not deployed authorization proof. */
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import {originalReadAllowed} from "../evidence-access";
class AuthError extends Error {constructor(public code:string,message:string){super(message);}}
async function route(role:string,options:{foreign?:boolean;revoked?:boolean}={}) {
 const path=new URL("../../../app/api/evidence/[evidenceId]/original/route.ts",import.meta.url);
 const compiled=ts.transpileModule(await readFile(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/^import .*\n/gm,"").replace(/^export /gm,"")+"\nGET";
 const calls={read:0,validated:0,closed:0,scopes:0};
 const evidence={id:"e",incidentId:"i",classification:"SYNTHETIC",sha256:"a".repeat(64)};
 const conn={db:{scopedEvidence:{iter:()=>[evidence]}},disconnect:()=>{calls.closed++;}};
 const GET=runInNewContext(compiled,{authenticatedBackend:async()=>({conn,session:{user:{id:"u"}},credentials:{idToken:"synthetic-only"}}),AuthError,requireScope:()=>{calls.scopes++;if(options.foreign || options.revoked && calls.scopes>1)throw new AuthError("FORBIDDEN","Scope denied");return {memberships:[{userId:"u",role,active:true,capabilities:["READ"]}]};},originalReadAllowed,readOriginal:async()=>{calls.read++;return new Uint8Array([65]);},validateActiveClerkSession:async()=>{calls.validated++;},endpointFailure:(error:AuthError)=>Response.json({ok:false,error:{code:error.code}},{status:403}),process:{env:{EVIDENCE_STORAGE_DIR:"/synthetic/private"}},Response,Uint8Array}) as (request:Request,context:{params:Promise<{evidenceId:string}>})=>Promise<Response>;
 const response=await GET(new Request("https://breachbay.us/api/evidence/e/original"),{params:Promise.resolve({evidenceId:"e"})});return {response,calls};
}
test("AI original HTTP route denied before storage or Clerk revalidation despite READ",async()=>{
 const {response,calls}=await route("AI_SERVICE");assert.equal(response.status,403);assert.equal(calls.read,0);assert.equal(calls.validated,0);assert.equal(calls.closed,1);
});
test("foreign scope denied before original storage read",async()=>{
 const {response,calls}=await route("OBSERVER",{foreign:true});assert.equal(response.status,403);assert.equal(calls.read,0);assert.equal(calls.closed,1);
});
test("scoped human gets attachment only after active-session and second scope check",async()=>{
 const {response,calls}=await route("OBSERVER");assert.equal(response.status,200);assert.equal(await response.text(),"A");assert.equal(response.headers.get("content-type"),"application/octet-stream");assert.equal(response.headers.get("cache-control"),"no-store");assert.equal(calls.read,1);assert.equal(calls.validated,1);assert.equal(calls.scopes,2);assert.equal(calls.closed,1);
});
test("revocation during original read prevents byte delivery",async()=>{
 const {response,calls}=await route("OBSERVER",{revoked:true});assert.equal(response.status,403);assert.equal(calls.read,1);assert.equal(calls.validated,1);assert.equal(calls.closed,1);
});
