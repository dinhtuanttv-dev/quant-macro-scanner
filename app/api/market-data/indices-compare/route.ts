import { NextResponse } from "next/server";
import { fetchIndicesLatest } from "@/lib/market-data/vndirect-adapter";

export const maxDuration = 10;

const INDEX_LABELS: Record<string, string> = {
  VN30: "VN30",
  HNX: "HNX-Index",
  UPCOM: "UPCOM",
};

export async function GET() {
  try {
    const quotes = await fetchIndicesLatest(["VN30", "HNX", "UPCOM"]);

    const compare = Object.entries(quotes)
      .filter(([, q]) => q !== null)
      .map(([symbol, q]) => ({
        index: INDEX_LABELS[symbol] ?? symbol,
        value: q!.close,
        changePct: q!.changePct,
      }));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      compare,
    });
  } catch (err) {
    console.error("[api/market-data/indices-compare] Loi:", err);
    return NextResponse.json(
      { error: "Khong lay duoc du lieu so sanh chi so." },
      { status: 500 }
    );
  }
}
