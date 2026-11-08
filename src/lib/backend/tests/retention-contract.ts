import assert from "node:assert/strict";
import { defaultRetentionPolicy, validateRetentionSettings } from "../../../../spacetimedb/src/retention";
import { setIncidentRetentionPolicy, type DbConnection } from "../client";
const legacy=defaultRetentionPolicy("legacy");
assert.equal(legacy.version,0);assert.equal(legacy.indefinite,true);assert.equal(legacy.minimumRetentionDays,30);assert.equal(legacy.hold,false);assert.equal(legacy.updatedAt,undefined);assert.equal(legacy.updatedBy,undefined);
for(const minimumRetentionDays of [0,3651,2.5,NaN])assert.throws(()=>validateRetentionSettings({indefinite:true,hold:false,minimumRetentionDays}));
async function main(){
 const forbiddenConnection=new Proxy({},{get(){throw new Error("Invalid settings must not access a transport or serialize a truncated u32");}}) as DbConnection;
 const command={incidentId:"legacy",indefinite:true,hold:false,minimumRetentionDays:30,expectedVersion:0,reason:"Preserve case",idempotencyKey:"synthetic-key",correlationId:"synthetic-correlation"};
 for(const invalid of [{...command,minimumRetentionDays:2.5},{...command,expectedVersion:0.5},{...command,expectedVersion:-1},{...command,reason:" "}]){
  const result=await setIncidentRetentionPolicy(forbiddenConnection,invalid);
  assert.equal(result.ok,false);if(result.ok)assert.fail();assert.equal(result.error.code,"INVALID_INPUT");assert.equal(result.correlationId,command.correlationId);
 }
 console.log("PASS conservative legacy default and client fractional/version/reason denials before any transport or u32 serialization");
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Retention contract failure");process.exitCode=1;});
