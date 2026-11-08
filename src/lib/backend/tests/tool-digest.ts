import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { validatedToolArgumentsDigest } from "../tool-digest";
test("accepts exact argument hash and rejects missing/ambiguous trace digests",()=>{
 const digest=createHash("sha256").update('{"assetId":"app"}').digest("hex");
 assert.equal(validatedToolArgumentsDigest(digest),digest);
 for(const invalid of [undefined,null,"",digest.toUpperCase(),digest+"0",{digest}])assert.throws(()=>validatedToolArgumentsDigest(invalid));
});
