import { NextResponse } from "next/server";
import { fetchHoseNews, extractCorporateEvents } from "@/lib/ingestion/hose/hose-news-fetcher";

// Route TAM de kiem tra parse dung - se xoa sau khi xac nhan hoat dong dung.
export async function GET() {
  try {
    const news = await fetchHoseNews(7);
    const dailySummaries = news.filter((n) => n.catId === 1048);

    const allEvents = dailySummaries.flatMap((n) => extractCorporateEvents(n));

    return NextResponse.json({
      totalNews: news.length,
      dailySummaryCount: dailySummaries.length,
      extractedEventsCount: allEvents.length,
      sampleEvents: allEvents.slice(0, 10),
    });
  } catch (err) {
    console.error("[test-hose-parse] Loi:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
