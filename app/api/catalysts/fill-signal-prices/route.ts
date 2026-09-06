import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { getRecordsMissingPrice, fillPriceAtSignal } from "@/lib/catalyst/engine/SignalLedger";
import { fetchQuote } from "@/lib/market-data/yahoo-finance-adapter";

export const maxDuration = 10;
const redis = new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! });

// Dien gia luc tin hieu xuat hien - tach rieng khoi vong lap tinh diem chinh
// cua CatalystEngine de khong lam cham route scan (maxDuration=10s).
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const missing = await getRecordsMissingPrice(redis);
    const batch = missing.slice(0, 20); // gioi han moi lan chay, tranh vuot 10s

    const results = await Promise.allSettled(
      batch.map(async (r) => {
        const quote = await fetchQuote(r.ticker);
        if (quote.price !== null) await fillPriceAtSignal(redis, r.id, quote.price);
        return { id: r.id, filled: quote.price !== null };
      })
    );

    const filledCount = results.filter((r) => r.status === "fulfilled" && r.value.filled).length;
    return NextResponse.json({ ok: true, totalMissing: missing.length, processed: batch.length, filled: filledCount });
  } catch (err) {
    console.error("[api/catalysts/fill-signal-prices] Loi:", err);
    return NextResponse.json({ error: "Khong dien duoc gia tin hieu." }, { status: 500 });
  }
}
