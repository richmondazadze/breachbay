/** Real JWT/JWKS verification against a synthetic Clerk-shaped issuer. No actual Clerk login claimed. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import {
  authConfig,
  verifyIdToken,
  authenticatedAt,
  enforceOrigin,
} from "../clerk-token";
async function main() {
  Object.assign(process.env, {
    NODE_ENV: "test",
    OIDC_AUDIENCE: "breachbay.us",
    APP_ORIGIN: "http://127.0.0.1:3200",
  });
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: "synthetic-key",
    alg: "RS256",
    use: "sig",
  };
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/.well-known/jwks.json")
      res.end(JSON.stringify({ keys: [jwk] }));
    else {
      res.statusCode = 404;
      res.end("{}");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  process.env.CLERK_ISSUER_URL = `http://127.0.0.1:${address.port}`;
  const signed = (
    audience = "breachbay.us",
    origin = process.env.APP_ORIGIN!,
    lifetime = "1m",
    sessionId: string | undefined = "synthetic-session",
  ) =>
    new SignJWT({ sid: sessionId, fva: [0, -1], azp: origin })
      .setProtectedHeader({ alg: "RS256", kid: "synthetic-key" })
      .setIssuer(process.env.CLERK_ISSUER_URL!)
      .setAudience(audience)
      .setSubject("synthetic-responder")
      .setIssuedAt()
      .setExpirationTime(lifetime)
      .sign(privateKey);
  try {
    const claims = await verifyIdToken(await signed());
    assert.equal(claims.sub, "synthetic-responder");
    assert.equal(claims.sid, "synthetic-session");
    assert.ok(authenticatedAt(claims) <= Number(claims.iat) - 60);
    assert.equal(authenticatedAt({ iat: claims.iat }), 0);
    await assert.rejects(verifyIdToken(await signed("wrong-audience")));
    await assert.rejects(
      verifyIdToken(await signed("breachbay.us", "https://attacker.example")),
    );
    await assert.rejects(
      verifyIdToken(
        await signed("breachbay.us", process.env.APP_ORIGIN!, "-1s"),
      ),
    );
    await assert.rejects(
      verifyIdToken((await signed()).slice(0, -10) + "tampered"),
    );
    assert.throws(() =>
      enforceOrigin(
        new Request(authConfig().origin, {
          headers: { Origin: "https://attacker.example" },
        }),
      ),
    );
    enforceOrigin(
      new Request(authConfig().origin, {
        headers: { Origin: authConfig().origin },
      }),
    );
    console.log(
      "PASS synthetic Clerk-shaped JWT signature, trusted issuer/audience/origin, expiry, tamper rejection and conservative factor verification age",
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Clerk JWT test failed",
  );
  process.exit(1);
});
