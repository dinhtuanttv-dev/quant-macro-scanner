import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { withCdnCache } from "@/lib/http/cdnCache";
// P2 (Bo Loc Co Phieu - Nhom B): Frontend doc ket qua AI (Pros/Cons +
// Catalyst Score) DA QUET SAN tu Database (Cron Job dividend-ai-analysis
// cap nhat dinh ky, vong xoay 15 ma/ngay).
export const dynamic = "force-dynamic";

async function getUncached() {
  try {
    const entries = await prisma.dividendAiAnalysis.findMany();
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      totalCount: entries.length,
      entries,
    });
  } catch (err) {
    console.error("[api/cotuc/ai-analysis] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tải dữ liệu AI analysis lúc này." }, { status: 500 });
  }
}

/** CDN của Vercel trả lượt gọi lặp lại trong 300 giây (giảm CPU Fluid Active — hạn mức miễn phí). */
export const GET = withCdnCache(getUncached, 300);
