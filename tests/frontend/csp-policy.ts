import test from "node:test";
import assert from "node:assert/strict";
import { transportCspOrigins, removeInlineScriptFallback } from "../../src/components/auth/csp-policy";
import { normalizeClerkContinuation } from "../../src/components/auth/normalize-clerk-response";
test("CSP transport sources retain exact origin pairs without credentials or wildcard",()=>{
  assert.deepEqual(transportCspOrigins("https://db.example.com/v1/database/name"),["https://db.example.com","wss://db.example.com"]);
  for(const url of ["https://user:secret@db.example.com","http://db.example.com","javascript:alert(1)","invalid"])assert.deepEqual(transportCspOrigins(url),[]);
});
test("nonce script policy hardening preserves auth overrides and runtime style compatibility",()=>{
  const csp="script-src 'self' 'unsafe-inline' 'nonce-synthetic' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; object-src 'none'";
  const response=new Response(null,{headers:{"content-security-policy":csp,"x-middleware-request-content-security-policy":csp,"x-middleware-rewrite":"https://localhost:3100/","x-middleware-override-headers":"x-clerk-auth-status,content-security-policy","x-middleware-request-x-clerk-auth-status":"signed-out"}});
  normalizeClerkContinuation("https://localhost:3100/",removeInlineScriptFallback(response));
  const policy=response.headers.get("content-security-policy")!;
  assert.equal(policy.split(";")[0].includes("unsafe-inline"),false);assert.ok(policy.includes("nonce-synthetic"));assert.ok(policy.includes("strict-dynamic"));assert.ok(policy.includes("style-src 'self' 'unsafe-inline'"));
  assert.equal(response.headers.get("x-middleware-request-content-security-policy"),policy);assert.equal(response.headers.get("x-middleware-request-x-clerk-auth-status"),"signed-out");assert.equal(response.headers.get("x-middleware-next"),"1");
});
