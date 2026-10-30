import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

import { withCdnCache } from "@/lib/http/cdnCache";
const REDIS_KEY = "market-data:latest";

async function getUncached() {
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

/** CDN của Vercel trả lượt gọi lặp lại trong 60 giây (giảm CPU Fluid Active — hạn mức miễn phí). */
export const GET = withCdnCache(getUncached, 60);
