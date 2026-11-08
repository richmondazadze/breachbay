import {test} from "node:test";
import assert from "node:assert/strict";
import {deploymentReadiness} from "../deployment-readiness";
test("health exposes only configuration booleans/version without credentials",()=>{
 assert.equal(deploymentReadiness({}).ready,false);
 const fixture=Object.fromEntries(["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY","CLERK_SECRET_KEY","CLERK_ISSUER_URL","SPACETIMEDB_ENDPOINT","SPACETIMEDB_DATABASE","NEMOTRON_API_KEY","NEMOTRON_BASE_URL","NEMOTRON_MODEL","AI_SERVICE_ID_TOKEN","EVIDENCE_STORAGE_DIR"].map(k=>[k,"synthetic-secret-value"]));
 const result=deploymentReadiness(fixture);assert.equal(result.ready,true);assert(!JSON.stringify(result).includes("synthetic-secret-value"));assert(Object.values(result.dependencies).every(v=>typeof v==="boolean"));
 assert.equal(deploymentReadiness({...fixture,NEMOTRON_MODEL:" "}).ready,false);
});
test("health route returns no-store configuration-only response",async()=>{
 const {GET}=await import("../../../app/api/health/route");
 const response=await GET();assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"no-store");
 const body=await response.json();assert.deepEqual(Object.keys(body).sort(),["dependencies","ready","spacetimeVersion","version"]);
});
