import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// SIEU QUET AI - danh sach candidate DANG CHO xac nhan (tu Discovery).
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const candidates = await prisma.sieuQuetEventCandidate.findMany({
      where: { decision: null },
      orderBy: { discoveredAt: "desc" },
    });
    return NextResponse.json({ candidates });
  } catch (err) {
    console.error("[api/sieu-quet-ai/candidates] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tải danh sách candidate." }, { status: 500 });
  }
}
