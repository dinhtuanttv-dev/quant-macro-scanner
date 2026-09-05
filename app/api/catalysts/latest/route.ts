// app/api/catalysts/latest/route.ts — PHASE 2 UPGRADE
// Da tich hop readSnapshotWithStaleness - client gio nhan them isStale + ageMinutes
// thay vi chi "co du lieu / khong co du lieu". UI co the hien "Du lieu cu (45 phut)"
// thay vi bien mat hoan toan khi scan that bai lien tuc.

import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { readSnapshotWithStaleness } from "@/lib/catalyst/engine/SnapshotStore"; // ★PHASE 2

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export async function GET() {
  const { snapshot, isStale, ageMinutes } = await readSnapshotWithStaleness(redis);

  if (!snapshot) {
    return NextResponse.json({ error: "Chưa có dữ liệu - chờ lần quét cron đầu tiên" }, { status: 404 });
  }

  // ★PHASE 2: trả thêm 2 field mới, client (useCatalystData) đọc để hiển thị cảnh báo
  return NextResponse.json({ ...snapshot, isStale, ageMinutes });
}
