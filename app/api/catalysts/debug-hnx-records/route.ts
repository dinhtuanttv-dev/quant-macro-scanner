import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const records = await prisma.macroNewsRecord.findMany({
    where: { sourceId: { startsWith: "hnx-" } },
    select: { sourceId: true, headline: true, relatedTickers: true, affectedSectors: true, type: true },
  });
  return NextResponse.json(records);
}
