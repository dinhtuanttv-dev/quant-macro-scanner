import { NextResponse } from "next/server";
import { ingestHnxDisclosures } from "@/lib/ingestion/hnx/hnx-ingest";

export const maxDuration = 10;

// Chay TRUOC catalysts/scan - ghi vao macroNewsRecord truoc, de
// ingestFromMacroNews() (goi trong scan) doc duoc du lieu HNX vua them.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await ingestHnxDisclosures();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[api/catalysts/ingest-hnx] Loi:", err);
    return NextResponse.json({ error: "Khong ingest duoc du lieu HNX." }, { status: 500 });
  }
}
