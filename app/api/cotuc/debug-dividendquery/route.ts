import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ROUTE DEBUG TAM THOI - test CHINH XAC cau query da xac nhan la
// diem treo (prisma.dividendCycleWindow.findMany), va SO SANH voi
// $queryRaw SQL tuong duong - de biet van de o "Prisma query builder"
// (co the sinh SQL khac thuong) hay o CHINH BANG/DU LIEU that (thieu
// index, qua nhieu dong).
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker")?.toUpperCase() ?? "MWG";
  const timings: Record<string, number> = {};
  let t = Date.now();

  try {
    console.error(`[debug-dividendquery] ${ticker} - dem tong so dong trong bang (khong loc)`);
    const totalCount = await prisma.dividendCycleWindow.count();
    timings.countAll = Date.now() - t; t = Date.now();
    console.error(`[debug-dividendquery] ${ticker} - countAll XONG (${timings.countAll}ms), tong=${totalCount}`);

    console.error(`[debug-dividendquery] ${ticker} - dem so dong CUA RIENG ma nay`);
    const countForTicker = await prisma.dividendCycleWindow.count({ where: { ticker } });
    timings.countForTicker = Date.now() - t; t = Date.now();
    console.error(`[debug-dividendquery] ${ticker} - countForTicker XONG (${timings.countForTicker}ms), so_dong=${countForTicker}`);

    console.error(`[debug-dividendquery] ${ticker} - $queryRaw SQL tuong duong`);
    const rawResult = await prisma.$queryRaw`SELECT * FROM "DividendCycleWindow" WHERE ticker = ${ticker} ORDER BY "exDate" DESC`;
    timings.rawQuery = Date.now() - t; t = Date.now();
    console.error(`[debug-dividendquery] ${ticker} - rawQuery XONG (${timings.rawQuery}ms)`);

    console.error(`[debug-dividendquery] ${ticker} - prisma.findMany() THAT (cau query dang bi treo trong production)`);
    const findManyResult = await prisma.dividendCycleWindow.findMany({ where: { ticker }, orderBy: { exDate: "desc" } });
    timings.findMany = Date.now() - t;
    console.error(`[debug-dividendquery] ${ticker} - findMany XONG (${timings.findMany}ms)`);

    return NextResponse.json({
      ticker, timings,
      totalCount, countForTicker,
      rawRowCount: Array.isArray(rawResult) ? rawResult.length : null,
      findManyRowCount: findManyResult.length,
    });
  } catch (err) {
    console.error(`[debug-dividendquery] ${ticker} - LOI:`, err);
    return NextResponse.json({ ticker, timings, error: err instanceof Error ? err.message : String(err) });
  }
}
