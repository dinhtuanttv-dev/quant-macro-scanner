// app/api/recommendations/test-cafef/route.ts
// Route TẠM THỜI chỉ để test scraper CafeF độc lập, không phục vụ production.
// Sau khi xác nhận chạy đúng, XOÁ file này (đã nhắc rõ trong bước xác nhận cuối cùng).

import { NextResponse } from "next/server";
import { scrapeCafefRecommendations } from "@/lib/recommendations/cafef-scraper";
import { ingestBatch } from "@/lib/catalyst/sourceIngestion";

export async function GET() {
  try {
    const records = await scrapeCafefRecommendations();

    if (records.length === 0) {
      return NextResponse.json({
        ok: false,
        warning: "Scraper chay khong loi nhung khong lay duoc ban ghi nao - kiem tra lai selector",
      });
    }

    const summary = await ingestBatch(records);

    return NextResponse.json({
      ok: true,
      totalScraped: records.length,
      sample: records.slice(0, 3), // xem thử 3 bản ghi đầu để kiểm tra dữ liệu có đúng không
      ingestSummary: summary,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}