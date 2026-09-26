import { NextResponse } from "next/server";
import { Client } from "pg";

// ROUTE DEBUG TAM THOI - test TRUC TIEP thu vien "pg" goc (KHONG qua
// Prisma) de co lap: van de nam o tang Prisma/adapter-pg, hay o tang
// ket noi mang co ban toi Neon Postgres (TCP/DNS/network) ma KHONG
// mot loai timeout nao cua Prisma co the kiem soat duoc.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const t0 = Date.now();
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8_000,
    query_timeout: 8_000,
    statement_timeout: 8_000,
  });

  try {
    console.error("[debug-rawpg] BAT DAU connect()");
    await client.connect();
    console.error(`[debug-rawpg] connect() XONG (${Date.now() - t0}ms)`);

    const res = await client.query("SELECT 1 as test, NOW() as now");
    console.error(`[debug-rawpg] query XONG (${Date.now() - t0}ms)`);

    await client.end();
    return NextResponse.json({ success: true, elapsedMs: Date.now() - t0, result: res.rows[0] });
  } catch (err) {
    console.error(`[debug-rawpg] LOI sau ${Date.now() - t0}ms:`, err);
    try { await client.end(); } catch {}
    return NextResponse.json({
      success: false,
      elapsedMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
      errorName: err instanceof Error ? err.name : undefined,
    });
  }
}
