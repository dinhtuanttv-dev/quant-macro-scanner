import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

const REDIS_KEY = "market-data:latest";

export async function GET() {
  try {
    const data = await kv.get(REDIS_KEY);
    if (!data) {
      return NextResponse.json({ error: "Chua co du lieu - cho lan quet dau tien" });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/market-data/latest] Loi:", err);
    return NextResponse.json({ error: "Khong doc duoc du lieu thi truong." }, { status: 500 });
  }
}
