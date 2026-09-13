import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// SIEU QUET AI - Xac nhan candidate (A.8.5 idempotency). Nguoi dung LA
// BEN "doi chung" cuoi cung (thay cho 2-3 AI doc lap cua ban goc, vi
// chi co 1 AI provider - Gemini).
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const idempotencyKey: string | undefined = body.idempotencyKey;
    if (!idempotencyKey) {
      return NextResponse.json({ error: "Thiếu idempotencyKey." }, { status: 400 });
    }

    const rateState = await prisma.sieuQuetRateState.upsert({
      where: { userId: "default_user" },
      create: { userId: "default_user" },
      update: {},
    });

    if (rateState.lastIdempotencyKeys.includes(idempotencyKey)) {
      // A.8.5: da xu ly truoc do - tra lai trang thai hien tai, KHONG lam lai
      const candidate = await prisma.sieuQuetEventCandidate.findUnique({ where: { id } });
      return NextResponse.json({ replay: true, candidate });
    }

    const candidate = await prisma.sieuQuetEventCandidate.findUnique({ where: { id } });
    if (!candidate) {
      return NextResponse.json({ error: "Candidate không tồn tại." }, { status: 404 });
    }
    if (candidate.decision !== null) {
      return NextResponse.json({ error: "Candidate đã được xử lý trước đó." }, { status: 409 });
    }

    await prisma.sieuQuetEventCandidate.update({
      where: { id }, data: { decision: "confirmed", decidedAt: new Date() },
    });

    const event = await prisma.sieuQuetEvent.create({
      data: {
        title: candidate.rawTitle, category: candidate.category, source: "ai_discovery",
        enteredBy: "default_user", severity: 3,
        description: `Sự kiện qua AI Discovery (Gemini + Google Search), xác nhận bởi người dùng. ${candidate.aiSummary}`,
        expectedDurationDays: 14, sectors: candidate.sectors,
        magnitude: candidate.magnitude, direction: candidate.direction,
        sourceUrl: candidate.sourceUrl, sourceName: candidate.sourceName,
        verifiedStatus: "user_confirmed",
      },
    });

    const newKeys = [...rateState.lastIdempotencyKeys, idempotencyKey].slice(-20);
    await prisma.sieuQuetRateState.update({
      where: { userId: "default_user" },
      data: { skipStreak: 0, lastIdempotencyKeys: newKeys }, // A.8.4: reset skip streak khi co xac nhan
    });

    return NextResponse.json({ replay: false, event });
  } catch (err) {
    console.error("[api/sieu-quet-ai/candidates/[id]/confirm] Lỗi:", err);
    return NextResponse.json({ error: "Không thể xác nhận candidate." }, { status: 500 });
  }
}
