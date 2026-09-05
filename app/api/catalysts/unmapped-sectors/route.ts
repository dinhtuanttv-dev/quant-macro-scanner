import { NextResponse } from "next/server";
import { getUnmappedSectors } from "@/lib/catalyst/engine/SectorRegistry";

export async function GET() {
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
