import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// SIEU QUET AI - Bo qua candidate (A.8.2 rate-limit rieng cho skip,
// A.8.4 exit condition sau MAX_SKIP_STREAK lan lien tiep -> cooldown,
// A.8.5 idempotency). PORT DUNG hang so tu events.py goc.
export const dynamic = "force-dynamic";

const MAX_SKIP_PER_HOUR = 10;   // A.8.2
const MAX_SKIP_STREAK = 8;      // A.8.4
const SKIP_COOLDOWN_MS = 60 * 60 * 1000; // A.8.4 (60 phut)

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
      return NextResponse.json({ replay: true, nextCandidate: null, cooldownTriggered: false });
    }

    // A.8.4: dang trong cooldown?
    const now = new Date();
    if (rateState.cooldownUntil && rateState.cooldownUntil > now) {
      const remainingMin = Math.ceil((rateState.cooldownUntil.getTime() - now.getTime()) / 60000);
      return NextResponse.json({ error: `Đang trong thời gian tạm dừng quét tự động, còn ${remainingMin} phút.` }, { status: 429 });
    }

    // A.8.2: rate-limit skip/gio
    const oneHourAgo = new Date(now.getTime() - 3600 * 1000);
    const recentSkips = rateState.skipTimestamps.filter((t: Date) => t > oneHourAgo);
    if (recentSkips.length >= MAX_SKIP_PER_HOUR) {
      return NextResponse.json({ error: "Đã hết lượt bỏ qua trong giờ này, thử lại sau." }, { status: 429 });
    }

    const candidate = await prisma.sieuQuetEventCandidate.findUnique({ where: { id } });
    if (!candidate) return NextResponse.json({ error: "Candidate không tồn tại." }, { status: 404 });
    if (candidate.decision !== null) return NextResponse.json({ error: "Candidate đã được xử lý trước đó." }, { status: 409 });

    await prisma.sieuQuetEventCandidate.update({ where: { id }, data: { decision: "skipped", decidedAt: now } });

    const newSkipStreak = rateState.skipStreak + 1;
    const newKeys = [...rateState.lastIdempotencyKeys, idempotencyKey].slice(-20);
    const newTimestamps = [...recentSkips, now];

    if (newSkipStreak >= MAX_SKIP_STREAK) {
      // A.8.4: exit condition - vao cooldown
      await prisma.sieuQuetRateState.update({
        where: { userId: "default_user" },
        data: {
          skipStreak: 0, cooldownUntil: new Date(now.getTime() + SKIP_COOLDOWN_MS),
          skipTimestamps: newTimestamps, lastIdempotencyKeys: newKeys,
        },
      });
      return NextResponse.json({ replay: false, nextCandidate: null, cooldownTriggered: true });
    }

    await prisma.sieuQuetRateState.update({
      where: { userId: "default_user" },
      data: { skipStreak: newSkipStreak, skipTimestamps: newTimestamps, lastIdempotencyKeys: newKeys },
    });

    const remaining = await prisma.sieuQuetEventCandidate.findFirst({
      where: { decision: null }, orderBy: { discoveredAt: "desc" },
    });

    return NextResponse.json({ replay: false, nextCandidate: remaining, cooldownTriggered: false });
  } catch (err) {
    console.error("[api/sieu-quet-ai/candidates/[id]/skip] Lỗi:", err);
    return NextResponse.json({ error: "Không thể bỏ qua candidate." }, { status: 500 });
  }
}
