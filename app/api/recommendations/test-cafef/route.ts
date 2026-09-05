// app/api/recommendations/test-cafef/route.ts
// Route TAM THOI chi de test scraper CafeF doc lap, khong phuc vu production.
// Sau khi xac nhan chay dung, XOA file nay (da nhac ro trong buoc xac nhan cuoi cung).
import { NextResponse } from "next/server";
import { scrapeCafefRecommendations } from "@/lib/recommendations/cafef-scraper";
import { ingestBatch } from "@/lib/catalyst/sourceIngestion";

export async function GET() {
  try {
    const result = await scrapeCafefRecommendations();

    if (result.records.length === 0) {
      return NextResponse.json({
        ok: false,
        warning: "Scraper chay khong loi nhung khong lay duoc ban ghi nao - kiem tra lai selector",
        circuitBreakerTripped: result.circuitBreakerTripped,
        timeBudgetExhausted: result.timeBudgetExhausted,
        attemptedCount: result.attemptedCount,
        elapsedMs: result.elapsedMs,
      });
    }

    const summary = await ingestBatch(result.records);
    return NextResponse.json({
      ok: true,
      totalScraped: result.records.length,
      circuitBreakerTripped: result.circuitBreakerTripped,
      timeBudgetExhausted: result.timeBudgetExhausted,
      attemptedCount: result.attemptedCount,
      successCount: result.successCount,
      elapsedMs: result.elapsedMs,
      sample: result.records.slice(0, 3),
      ingestSummary: summary,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
