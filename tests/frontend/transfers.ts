import test from "node:test";
import assert from "node:assert/strict";
import { downloadResponse, evidenceForm, syntheticFile } from "../../src/hooks/protected-transfers";
import { normalizeClerkContinuation } from "../../src/components/auth/normalize-clerk-response";

test("JSON error is never saved as an attachment", async () => {
  const result = await downloadResponse(Response.json({ ok: false, correlationId: "denied", error: { code: "FORBIDDEN", message: "No scope", retryable: false } }, { status: 403 }), "request");
  assert.equal(result.ok, false);
  assert.equal(result.correlationId, "denied");
});
test("unconfirmed JSON success and HTML proxy errors are not downloads", async () => {
  for (const response of [Response.json({ summary: {} }), new Response("proxy failed", { status: 502 })]) {
    const result = await downloadResponse(response, "same-key-reference");
    assert.equal(result.ok, false);
    assert.equal(result.correlationId, "same-key-reference");
  }
});
test("authorized attachment preserves bytes and server reference", async () => {
  const result = await downloadResponse(new Response('{"incident":"synthetic"}', { headers: { "Content-Disposition": "attachment; filename=breachbay-report.json", "X-Correlation-Id": "server" } }), "request");
  assert.equal(result.ok, true);
  if (result.ok) { assert.equal(result.data.filename, "breachbay-report.json"); assert.equal(result.correlationId, "server"); assert.equal(await result.data.blob.text(), '{"incident":"synthetic"}'); }
});
test("upload retry form retains exact bytes, metadata and explicit model denial", async () => {
  const file = syntheticFile(new File(["a,b\n1,2"], "synthetic.csv", { type: "application/vnd.ms-excel" }));
  const c = { incidentId: "incident", file, title: "Synthetic", modelApproved: false, idempotencyKey: "same", correlationId: "ref" };
  for (let i = 0; i < 2; i++) {
    const form = evidenceForm(c);
    assert.equal(form.get("idempotencyKey"), "same"); assert.equal(form.get("modelApproved"), "false"); assert.equal(form.get("classification"), "SYNTHETIC");
    assert.equal((form.get("file") as File).type, "text/csv"); assert.equal(await (form.get("file") as File).text(), "a,b\n1,2");
  }
  assert.throws(() => syntheticFile(new File([""], "empty.txt")));
  assert.throws(() => syntheticFile(new File(["a".repeat(262145)], "large.txt")));
  assert.throws(() => syntheticFile(new File(["a"], "script.exe")));
});
test("Clerk exact self rewrite becomes continuation with authentication overrides preserved", () => {
  const url = "https://localhost:3000/command?view=all";
  const response = new Response(null, { headers: { "x-middleware-rewrite": url, "x-middleware-override-headers": "x-clerk-auth-status", "x-middleware-request-x-clerk-auth-status": "signed-out", "set-cookie": "synthetic=value" } });
  normalizeClerkContinuation(url, response);
  assert.equal(response.headers.get("x-middleware-next"), "1"); assert.equal(response.headers.has("x-middleware-rewrite"), false);
  assert.equal(response.headers.get("x-middleware-override-headers"), "x-clerk-auth-status"); assert.equal(response.headers.get("set-cookie"), "synthetic=value");
});
test("Clerk real rewrites and redirects are untouched", () => {
  for (const headers of [{ "x-middleware-rewrite": "https://localhost:3000/other" }, { "x-middleware-rewrite": "https://localhost:3000/command", location: "https://breachbay.us/sign-in" }] as Record<string, string>[]) {
    const response = new Response(null, { headers });
    const original = [...response.headers]; normalizeClerkContinuation("https://localhost:3000/command", response);
    assert.deepEqual([...response.headers], original);
  }
});
