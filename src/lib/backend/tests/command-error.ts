import assert from "node:assert/strict";
import { BackendCommandError, backendBoundaryFailure, canonicalBackendCommandError, committedCommandData } from "../command-error";
import { AuthError } from "../clerk-token";
for(const [code,status] of [["INVALID_TRANSITION",409],["VERSION_CONFLICT",409],["UNAUTHENTICATED",401],["FORBIDDEN",403]] as const){
  let cause: unknown;
  try { committedCommandData({ok:false,error:{code,message:"private reducer detail secret=fictional",retryable:false},correlationId:"correlation"}); } catch(error){cause=error;}
  assert(cause instanceof BackendCommandError);assert(cause instanceof AuthError);
  const boundary=backendBoundaryFailure(cause)!;
  assert.equal(boundary.code,code);assert.equal(boundary.status,status);
  assert(!boundary.message.includes("private"));assert.notEqual(boundary.code,"INVALID_MODEL_OUTPUT");
  assert.equal(canonicalBackendCommandError(new Error(JSON.stringify({code,message:"private wire detail"}))).code,code);
}
assert.equal(canonicalBackendCommandError(new Error("private unknown failure")).code,"DEPENDENCY_UNAVAILABLE");
assert.deepEqual(committedCommandData({ok:true,data:{id:"canonical"},correlationId:"correlation"}),{id:"canonical"});
console.log("PASS canonical lifecycle/version/auth error codes and HTTP statuses survive while private reducer messages are discarded");
