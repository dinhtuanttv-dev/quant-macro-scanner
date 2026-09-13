import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// SIEU QUET AI - Phuong an B: nhap su kien THU CONG (khong ton quota
// AI). Nguoi nhap TU CHIU TRACH NHIEM ve tinh chinh xac - verifiedStatus
// = "user_confirmed" NGAY (giong create_manual_event trong events.py goc).
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const events = await prisma.sieuQuetEvent.findMany({
      where: { verifiedStatus: "user_confirmed" },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ events });
  } catch (err) {
    console.error("[api/sieu-quet-ai/events GET] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tải danh sách sự kiện." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, category, severity, description, sectors, tickers, expectedDurationDays, magnitude, direction } = body;

    if (!title || !category || !description || !Array.isArray(sectors) || sectors.length === 0) {
      return NextResponse.json({ error: "Thiếu trường bắt buộc: title, category, description, sectors (>=1)." }, { status: 400 });
    }
    if (!["high", "medium", "low"].includes(magnitude) || !["positive", "negative"].includes(direction)) {
      return NextResponse.json({ error: "magnitude phải là high/medium/low, direction phải là positive/negative." }, { status: 400 });
    }

    const event = await prisma.sieuQuetEvent.create({
      data: {
        title, category, source: "manual_input", enteredBy: "default_user",
        severity: severity ?? 3, description,
        expectedDurationDays: expectedDurationDays ?? null,
        sectors, tickers: tickers ?? [], magnitude, direction,
        verifiedStatus: "user_confirmed",
      },
    });

    return NextResponse.json({ event });
  } catch (err) {
    console.error("[api/sieu-quet-ai/events POST] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tạo sự kiện." }, { status: 500 });
  }
}
