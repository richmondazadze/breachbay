import assert from "node:assert/strict";
import { investigate, type InvestigationPorts } from "../../ai/investigation";
import { BackendCommandError } from "../command-error";
import { credentialCompromiseScenario } from "../../simulation/scenario";
const originalFetch=globalThis.fetch;
let dispatches=0;
globalThis.fetch=async()=>{dispatches++;throw new Error("No provider call is permitted in this denial test");};
async function main(){
 for(const code of ["FORBIDDEN","UNAUTHENTICATED","INVALID_TRANSITION","VERSION_CONFLICT"] as const){
  let events=0,proposals=0;
  const ports:InvestigationPorts={loadContext:async()=>{throw new BackendCommandError(code);},persistEvent:async()=>{events++;},submitProposal:async()=>{proposals++;return "forbidden";}};
  await assert.rejects(investigate("synthetic-denial","Review synthetic evidence",ports),cause=>cause instanceof BackendCommandError && cause.code===code);
  assert.equal(dispatches,0);assert.equal(events,0);assert.equal(proposals,0);
 }
 // The configured values below are deliberately fictitious; no real credential or endpoint is used.
 process.env.NEMOTRON_API_KEY="synthetic-not-a-credential";process.env.NEMOTRON_BASE_URL="https://example.invalid/v1";process.env.NEMOTRON_MODEL="synthetic-model";
 for(const code of ["FORBIDDEN","UNAUTHENTICATED","INVALID_TRANSITION","VERSION_CONFLICT"] as const){
  let events=0,proposals=0;
  const ports:InvestigationPorts={loadContext:async()=>({incidentId:"synthetic-denial",summary:"Synthetic denial test",scenario:credentialCompromiseScenario("synthetic-denial"),evidence:[]}),persistEvent:async()=>{events++;throw new BackendCommandError(code);},submitProposal:async()=>{proposals++;return "forbidden";}};
  await assert.rejects(investigate("synthetic-denial","Review synthetic evidence",ports),cause=>cause instanceof BackendCommandError && cause.code===code);
  assert.equal(dispatches,0);assert.equal(events,1);assert.equal(proposals,0);
 }
 console.log("PASS real orchestration preserves load/start lifecycle/version/auth denials with zero provider dispatch, correction/retry events or proposal writes");
}
main().finally(()=>{globalThis.fetch=originalFetch;}).catch(cause=>{console.error(cause instanceof Error ? cause.message : "Denial test failed");process.exitCode=1;});
