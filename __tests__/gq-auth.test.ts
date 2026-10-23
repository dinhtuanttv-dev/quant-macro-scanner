import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { createGqVerifier, GQ_AUDIENCE, GQ_ISSUER } from "@/lib/catalyst/chat/gqAuth";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
function keyPair(kid: string) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return { kid, privateKey, jwk: { ...publicKey.export({ format: "jwk" }), kid, alg: "EdDSA", use: "sig" } };
}
function token(k: ReturnType<typeof keyPair>, claims: Record<string, unknown>, header: Record<string, unknown> = {}) {
  const h = b64({ alg: "EdDSA", typ: "JWT", kid: k.kid, ...header }), b = b64(claims);
  return `${h}.${b}.${sign(null, Buffer.from(`${h}.${b}`), k.privateKey).toString("base64url")}`;
}

describe("Hỏi đáp xúc tác — xác thực token Gateway (JWKS Ed25519)", () => {
  const now = 1_800_000_000_000, sec = now / 1000;
  const k1 = keyPair("k1"), k2 = keyPair("k2");
  const good = { iss: GQ_ISSUER, aud: GQ_AUDIENCE, sub: "user-1", iat: sec, exp: sec + 900 };
  const jwks = (keys: unknown[]) => async () => new Response(JSON.stringify({ keys }));

  it("token hợp lệ -> userId; sai chữ ký / khoá khác / hết hạn / sai aud / alg none -> null", async () => {
    const v = createGqVerifier({ fetchImpl: jwks([k1.jwk]) as unknown as typeof fetch, url: "https://gw/jwks", now: () => now });
    expect(await v(`Bearer ${token(k1, good)}`)).toBe("user-1");
    const t = token(k1, good).split(".");
    expect(await v(`Bearer ${t[0]}.${b64({ ...good, sub: "admin" })}.${t[2]}`)).toBeNull();
    expect(await v(`Bearer ${token(k2, good, { kid: "k1" })}`)).toBeNull();
    expect(await v(`Bearer ${token(k1, { ...good, exp: sec - 100 })}`)).toBeNull();
    expect(await v(`Bearer ${token(k1, { ...good, aud: "khac" })}`)).toBeNull();
    expect(await v(`Bearer ${b64({ alg: "none", typ: "JWT", kid: "k1" })}.${b64(good)}.`)).toBeNull();
    expect(await v(null)).toBeNull();
  });

  it("kid mới (xoay khoá) -> tải lại JWKS một lần", async () => {
    let calls = 0;
    const fetchImpl = (async () => { calls++; return new Response(JSON.stringify({ keys: calls === 1 ? [k1.jwk] : [k1.jwk, k2.jwk] })); }) as unknown as typeof fetch;
    const v = createGqVerifier({ fetchImpl, url: "https://gw/jwks", now: () => now });
    expect(await v(`Bearer ${token(k1, good)}`)).toBe("user-1");
    expect(await v(`Bearer ${token(k2, good)}`)).toBe("user-1");
    expect(calls).toBe(2);
  });
});
