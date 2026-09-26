import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ROUTE DEBUG TAM THOI - test PrismaClient (KHONG PHAI pg.Client
// thuan) voi query DON GIAN NHAT CO THE ($queryRaw SELECT 1, khong
// dung bang nao) - de co lap: van de o tang "PrismaClient noi chung"
// (query engine/khoi tao), hay CHI RIENG bang DividendCycleWindow/
// query findMany() cu the.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const t0 = Date.now();
  try {
    console.error("[debug-prismaraw] BAT DAU $queryRaw");
    const result = await prisma.$queryRaw`SELECT 1 as test, NOW() as now`;
    console.error(`[debug-prismaraw] $queryRaw XONG (${Date.now() - t0}ms)`);
    return NextResponse.json({ success: true, elapsedMs: Date.now() - t0, result });
  } catch (err) {
    console.error(`[debug-prismaraw] LOI sau ${Date.now() - t0}ms:`, err);
    return NextResponse.json({
      success: false,
      elapsedMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
