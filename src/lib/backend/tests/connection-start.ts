import assert from 'node:assert/strict';
import {awaitConnection} from '../connection-start';
async function main(){
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
let disconnects=0;
const failure=new EvalError('Synthetic CSP constructor rejection');
await assert.rejects(awaitConnection(()=>{throw failure;},5),e=>e===failure);
await pause(15);assert.equal(disconnects,0);
let late:((c:{disconnect():void})=>void)|undefined;
const c={disconnect(){disconnects++;}};
await assert.rejects(awaitConnection(callbacks=>{late=callbacks.connected;return c;},5),/DEPENDENCY_UNAVAILABLE/);assert.equal(disconnects,1);
late!(c);assert.equal(disconnects,2);
let syncCloses=0;await assert.rejects(awaitConnection(cb=>{cb.failed(failure);return {disconnect(){syncCloses++;}};},5),e=>e===failure);assert.equal(syncCloses,1);
let successCloses=0;const success={disconnect(){successCloses++;}};assert.equal(await awaitConnection(cb=>{cb.connected(success);return success;},5),success);await pause(15);assert.equal(successCloses,0);
console.log('PASS original synchronous constructor error, cleared deadline, timeout/late-open cleanup and successful connection retention');

}
main().catch(error=>{console.error(error);process.exitCode=1;});
