import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! });

const KEYS = {
  vn30: "catalyst:vn30-review-watch",
  msci: "catalyst:msci-upgrade-watch",
  sbv: "catalyst:sbv-rate-watch",
} as const;

export async function GET() {
  try {
    const [vn30, msci, sbv] = await Promise.all([
      redis.get(KEYS.vn30),
      redis.get(KEYS.msci),
      redis.get(KEYS.sbv),
    ]);
    return NextResponse.json({
      findings: [
        vn30 ? { kind: "vn30", ...(vn30 as object) } : null,
        msci ? { kind: "msci", ...(msci as object) } : null,
        sbv ? { kind: "sbv", ...(sbv as object) } : null,
      ].filter(Boolean),
    });
  } catch (err) {
    console.error("[api/catalysts/vn30-review-latest] Loi:", err);
    return NextResponse.json({ error: "Khong doc duoc ket qua." }, { status: 500 });
  }
}
