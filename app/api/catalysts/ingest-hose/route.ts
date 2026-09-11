import { NextResponse } from "next/server";
import { ingestHoseData } from "@/lib/ingestion/hose/hose-ingest";

// FIX (2026-09-11): 15s qua thap cho khoi luong tin 7 ngay + ghi tuan tu
// tung dong (khong gop lo) - de gay FUNCTION_INVOCATION_TIMEOUT tren
// Vercel, KHONG lien quan gi den phan Foreign Flow moi them (chi cong
// them dung 1 lan ghi). Tang len 60s giong cac route xu ly nang khac
// trong du an (VD /api/ai/analyze).
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await ingestHoseData();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[api/catalysts/ingest-hose] Loi:", err);
    return NextResponse.json({ error: "Khong ingest duoc du lieu HOSE." }, { status: 500 });
  }
}
