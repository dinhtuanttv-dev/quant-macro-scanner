import { NextResponse } from "next/server";
import { getUnmappedSectors } from "@/lib/catalyst/engine/SectorRegistry";

import { withCdnCache } from "@/lib/http/cdnCache";
async function getUncached() {
  try {
    const data = await getUnmappedSectors();
    const items = Object.entries(data)
      .map(([rawKey, count]) => ({ rawKey, count }))
      .sort((a, b) => b.count - a.count);
    return NextResponse.json({ items, totalUnique: items.length });
  } catch (err) {
    console.error("[api/catalysts/unmapped-sectors] Loi:", err);
    return NextResponse.json({ error: "Khong doc duoc danh sach nganh chua anh xa." }, { status: 500 });
  }
}

/** CDN của Vercel trả lượt gọi lặp lại trong 900 giây (giảm CPU Fluid Active — hạn mức miễn phí). */
export const GET = withCdnCache(getUncached, 900);
