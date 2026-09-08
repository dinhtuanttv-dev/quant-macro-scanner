import { NextResponse } from "next/server";
import { ingestHoseData } from "@/lib/ingestion/hose/hose-ingest";

export const maxDuration = 15;

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
