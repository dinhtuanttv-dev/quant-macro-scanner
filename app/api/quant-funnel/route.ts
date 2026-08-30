import { NextResponse } from "next/server";
import { stockUniverse } from "@/lib/quant-data";
import { computeTang1, computeTang2, computeTang3, computeTang4, computeConfluence } from "@/lib/quant-funnel";

// Gop ca 4 tang + Elite 10 trong 1 lan goi - dung lai nguyen ven
// computeTang1..4/computeConfluence that tu lib/quant-funnel.ts, khong sua logic.
export async function GET() {
  try {
    const tang1 = computeTang1(stockUniverse);
    const tang2 = computeTang2(tang1, stockUniverse);
    const tang3 = computeTang3(tang2);
    const tang4 = computeTang4(tang3);
    const confluence = computeConfluence(tang1, tang2, tang3, tang4, stockUniverse);

    return NextResponse.json({
      universeSize: stockUniverse.length,
      tang1, tang2, tang3, tang4,
      confluence,
      eliteTop10: confluence.slice(0, 10),
      reserve11: confluence[10] ?? null,
    });
  } catch (err) {
    console.error("[api/quant-funnel] Loi:", err);
    return NextResponse.json({ error: "Khong tinh duoc pheu loc luc nay." }, { status: 500 });
  }
}
