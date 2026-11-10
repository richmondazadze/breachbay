import { canonical, hmac256 } from "./hash";
export function verifyResponseProof(json: string, signature: string, key?: string): Record<string, unknown> {
  if (!key || key.length < 32 || json.length > 12000 || !/^[a-f0-9]{64}$/.test(signature)) throw new Error("INVALID_PROOF");
  const value = JSON.parse(json);
  if (!value || typeof value !== "object" || Array.isArray(value) || canonical(value) !== json) throw new Error("INVALID_PROOF");
  const expected = hmac256(key, json);
  let difference = 0;
  for (let i = 0; i < 64; i++) difference |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  if (difference) throw new Error("INVALID_PROOF");
  return value;
}
