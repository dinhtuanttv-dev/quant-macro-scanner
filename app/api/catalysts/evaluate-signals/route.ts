import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { getUnevaluatedMaturedSignals, recordEvaluation, recomputeAndWriteCalibration } from "@/lib/catalyst/engine/SignalLedger";
import { fetchQuote } from "@/lib/market-data/yahoo-finance-adapter";

export const maxDuration = 10;
const redis = new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! });

// Doi chieu tin hieu da du 5 phien voi gia THAT, ghi ket qua thang/thua that,
// roi tinh lai catalyst:calibration - CatalystEngine.getWinRate() tu doc duoc
// khong can sua Engine.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const matured = await getUnevaluatedMaturedSignals(redis);
    const batch = matured.slice(0, 20);

    await Promise.allSettled(
      batch.map(async (r) => {
        const quote = await fetchQuote(r.ticker);
        if (quote.price === null || r.priceAtSignal === null) return;
        const priceChanged = quote.price >= r.priceAtSignal;
        const won = r.direction === "benefit" ? priceChanged : !priceChanged;
        await recordEvaluation(redis, r.id, quote.price, won);
      })
    );

    const calibrationResult = await recomputeAndWriteCalibration(redis);
    return NextResponse.json({ ok: true, evaluated: batch.length, calibration: calibrationResult });
  } catch (err) {
    console.error("[api/catalysts/evaluate-signals] Loi:", err);
    return NextResponse.json({ error: "Khong doi chieu duoc tin hieu." }, { status: 500 });
  }
}
