import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveSynthetic, digestBytes, MAX_EVIDENCE_BYTES, readOriginal, storeOriginal } from "../evidence-storage";
test("original integrity, incident isolation, immutable concurrent retry and restricted file modes",async()=>{
 const root=await mkdtemp(join(tmpdir(),"breachbay-evidence-"));
 try {
  const bytes=Buffer.from('Synthetic log: token=fictional-secret responder@example.invalid');
  const [hash,retry]=await Promise.all([storeOriginal(root,"incident-a",bytes),storeOriginal(root,"incident-a",bytes)]);
  assert.equal(hash,retry); assert.deepEqual(await readOriginal(root,"incident-a",hash),bytes);
  await assert.rejects(readOriginal(root,"incident-b",hash));
  const path=join(root,digestBytes(Buffer.from("incident-a")),hash);
  assert.equal((await stat(path)).mode & 0o777,0o600);
  assert.equal((await stat(join(path,".."))).mode & 0o777,0o700);
  await writeFile(path,"tampered"); await assert.rejects(readOriginal(root,"incident-a",hash),/integrity/);
  assert(!deriveSynthetic(bytes).includes("fictional-secret")); assert(!deriveSynthetic(bytes).includes("responder@"));
 }finally{await rm(root,{recursive:true,force:true});}
});
test("rejects binary, invalid UTF8, overlimit and application-tree storage",async()=>{
 assert.throws(()=>deriveSynthetic(new Uint8Array([255])));
 assert.throws(()=>deriveSynthetic(Buffer.from('binary\0')));
 assert.throws(()=>deriveSynthetic(new Uint8Array(MAX_EVIDENCE_BYTES+1)));
 await assert.rejects(storeOriginal(join(process.cwd(),"public"),"a",Buffer.from("synthetic")));
});

test("JSON MIME enforces synthetic log schema, canonical redaction and incident asset references",async()=>{
 const {validateSyntheticUpload}=await import("../evidence-storage");
 const valid=Buffer.from(JSON.stringify({eventType:"SYNTHETIC_LOGIN",description:"token=fictional-secret",sourceAssetId:"incident:workstation"}));
 const result=validateSyntheticUpload(valid,"application/json");assert.deepEqual(result.assetIds,["incident:workstation"]);assert(!result.redactedContent.includes("fictional-secret"));assert.equal(JSON.parse(result.redactedContent).eventType,"SYNTHETIC_LOGIN");
 for(const input of ['not JSON','{"eventType":','[]','null','{"eventType":"X"}','{"eventType":1,"description":"x"}',JSON.stringify({eventType:"X",description:"x",password:"secret"}),JSON.stringify({eventType:"X",description:"x".repeat(1501)})])assert.throws(()=>validateSyntheticUpload(Buffer.from(input),"application/json"),/INVALID_INPUT/);
 assert.equal(validateSyntheticUpload(Buffer.from("plain text"),"text/plain").redactedContent,"plain text");
 assert.equal(validateSyntheticUpload(Buffer.from("asset,outcome\nworkstation,blocked"),"text/csv").redactedContent,"asset,outcome\nworkstation,blocked");
});
