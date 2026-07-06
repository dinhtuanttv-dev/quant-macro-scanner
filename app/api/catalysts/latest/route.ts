// app/api/catalysts/latest/route.ts
// Route công khai cho client (Tab Chất xúc tác) đọc snapshot đã cache — không tính lại mỗi request.
// Dùng đúng tên biến KV_REST_API_URL / KV_REST_API_TOKEN, khớp với route scan.

import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export async function GET() {
  const snapshot = await redis.get("catalyst:snapshot:latest");
  if (!snapshot) {
    return NextResponse.json({ error: "Chưa có dữ liệu - chờ lần quét cron đầu tiên" }, { status: 404 });
  }
  return NextResponse.json(snapshot);
}