// Xác thực người dùng Global Quanta / ĐINH TUẤN cho Hỏi đáp xúc tác (23/10/2026): đăng nhập đã chuyển từ Supabase Auth sang
// Gateway trên Railway. Token là JWT ký Ed25519 ("EdDSA"); khoá công khai lấy từ JWKS của Gateway (đệm 10 phút, kid lạ -> tải lại
// một lần). Kiểm alg / kid / chữ ký / iss / aud / exp / nbf — không gọi mạng cho mỗi request.
import { createPublicKey, verify, type KeyObject } from "node:crypto";

export const GQ_ISSUER = "dinhtuan-gateway";
export const GQ_AUDIENCE = "dinhtuan-app";
const DEFAULT_GATEWAY = "https://gateway-production-1da0.up.railway.app";

type Jwk = { kty: string; crv?: string; x?: string; kid?: string; alg?: string };
export function jwksUrl(env: Record<string, string | undefined> = process.env): string {
  return `${(env.GQ_GATEWAY_URL || DEFAULT_GATEWAY).replace(/\/+$/, "")}/api/auth/.well-known/jwks.json`;
}

export function createGqVerifier({ fetchImpl = fetch, url = jwksUrl(), now = () => Date.now(), ttlMs = 10 * 60_000 }: { fetchImpl?: typeof fetch; url?: string; now?: () => number; ttlMs?: number } = {}) {
  let cache: { at: number; keys: Map<string, KeyObject> } | null = null;
  async function load(force = false) {
    if (!force && cache && now() - cache.at < ttlMs) return cache.keys;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`JWKS HTTP ${res.status}`);
    const body = (await res.json()) as { keys?: Jwk[] };
    const keys = new Map<string, KeyObject>();
    for (const k of body.keys ?? []) if (k.kty === "OKP" && k.crv === "Ed25519" && k.kid) keys.set(k.kid, createPublicKey({ key: k as unknown as import("node:crypto").JsonWebKey, format: "jwk" }));
    cache = { at: now(), keys };
    return keys;
  }
  /** userId (sub) nếu token hợp lệ, ngược lại null. */
  return async function verifyGqToken(authorization: string | null): Promise<string | null> {
    const token = /^Bearer\s+(.+)$/i.exec(authorization ?? "")?.[1]?.trim();
    const parts = token?.split(".") ?? [];
    if (parts.length !== 3) return null;
    let header: { alg?: string; typ?: string; kid?: string }, claims: { iss?: string; aud?: string; sub?: string; exp?: number; nbf?: number };
    try {
      header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
      claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    } catch { return null; }
    if (header.alg !== "EdDSA" || header.typ !== "JWT" || !header.kid) return null;
    let key = (await load()).get(header.kid);
    if (!key) key = (await load(true)).get(header.kid);
    if (!key) return null;
    if (!verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], "base64url"))) return null;
    const sec = Math.floor(now() / 1000);
    if (claims.iss !== GQ_ISSUER || claims.aud !== GQ_AUDIENCE || !claims.sub) return null;
    if (typeof claims.exp !== "number" || claims.exp + 30 < sec) return null;
    if (typeof claims.nbf === "number" && claims.nbf - 30 > sec) return null;
    return claims.sub;
  };
}
