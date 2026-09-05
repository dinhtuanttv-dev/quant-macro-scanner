// app/api/catalysts/latest/route.ts — PHASE 2 UPGRADE + resilience fix
// Da tich hop readSnapshotWithStaleness - client gio nhan them isStale + ageMinutes
// thay vi chi "co du lieu / khong co du lieu". UI co the hien "Du lieu cu (45 phut)"
// thay vi bien mat hoan toan khi scan that bai lien tuc.
// FIX: bao try/catch quanh Redis - phan biet "chua co du lieu" (binh thuong)
// voi "Redis loi tam thoi" (that su bat thuong, tra ve 503 rieng, khong crash 500 mo ho).
import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { readSnapshotWithStaleness } from "@/lib/catalyst/engine/SnapshotStore";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export async function GET() {
  try {
    const { snapshot, isStale, ageMinutes } = await readSnapshotWithStaleness(redis);
    if (!snapshot) {
      return NextResponse.json({ error: "Chua co du lieu - cho lan quet dau tien" });
    }
    return NextResponse.json({ ...snapshot, isStale, ageMinutes });
  } catch (err) {
    console.error("[api/catalysts/latest] Redis loi:", err);
    return NextResponse.json(
      { error: "Dich vu du lieu tam thoi gian doan - vui long thu lai sau it phut.", transient: true },
      { status: 503 }
    );
  }
}
