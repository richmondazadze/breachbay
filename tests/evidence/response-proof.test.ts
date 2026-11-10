import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { canonical, hmac256 } from "../../spacetimedb/src/hash";
import { verifyResponseProof } from "../../spacetimedb/src/response-proof";
test("portable HMAC matches standard SHA-256 vectors including long Unicode keys", () => {
  for (const key of ["secret", "🔑".repeat(100), "0".repeat(64)]) for (const message of ["", "application outcome", "é 🔐"]) assert.equal(hmac256(key, message), createHmac("sha256", key).update(message).digest("hex"));
});
test("response proofs require canonical exact bytes and reject forgery and key changes", () => {
  const key = "operator-secret".repeat(8), value = { kind: "PREVIEW", incidentId: "a", observation: { version: 1, loginEnabled: true } }, json = canonical(value), signature = hmac256(key, json);
  assert.deepEqual(verifyResponseProof(json, signature, key), value);
  for (const [body, sig, secret] of [[json, "0".repeat(64), key], [json.replace('"a"', '"b"'), signature, key], [JSON.stringify(value), signature, key], [json, signature, key + "changed"], [json, signature, ""]]) assert.throws(() => verifyResponseProof(body, sig, secret));
});
