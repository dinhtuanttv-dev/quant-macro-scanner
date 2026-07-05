// app/api/catalysts/latest/route.ts
// Route công khai cho client (Tab Chất xúc tác) đọc snapshot đã cache — không tính lại mỗi request.

import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export async function GET() {
  const snapshot = await kv.get("catalyst:snapshot:latest");
  if (!snapshot) {
    return NextResponse.json({ error: "Chưa có dữ liệu — chờ lần quét cron đầu tiên" }, { status: 404 });
  }
  return NextResponse.json(snapshot);
}