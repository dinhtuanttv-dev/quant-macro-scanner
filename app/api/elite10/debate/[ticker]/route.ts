import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { buildDebateDataPackage } from "@/lib/elite10/debate-data-summary";
import { runBullAgent, runBearAgent, runJury, resolveJuryVerdict, DEBATE_MODEL_NAME, IS_SINGLE_PROVIDER_DEBATE, IS_SINGLE_PROVIDER_JURY } from "@/lib/elite10/debate-agents";
import { runLmsrSession } from "@/lib/elite10/lmsr-market";

// Elite 10 - Muc A/B (Tech Spec v2) Giai doan 3/4: Multi-Agent Debate
// THAT (Bull+Bear = Gemini, xem ghi chu debate-agents.ts) + LMSR + Jury
// of Judges (2 Judge doc lap, tong hop finalVerdict). Route on-demand
// (POST, nguoi dung bam nut "Chay Debate AI" cho 1 ma cu the) - KHONG
// tu dong chay cho toan bo thi truong (kiem soat chi phi API, dung nhu
// da thong nhat).
export const dynamic = "force-dynamic";
export const maxDuration = 60; // debate 3 luot AI co the mat 15-30s

export async function POST(req: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  let sessionId: number | null = null;
  try {
    const { ticker: tickerParam } = await params;
    const ticker = tickerParam.toUpperCase();
    const body = await req.json().catch(() => ({}));
    const triggeredBy = body?.triggeredBy === "cron" ? "cron" : "on_demand";

    const session = await prisma.debateSession.create({ data: { ticker, status: "running", triggeredBy } });
    sessionId = session.id;

    const dataPackage = await buildDebateDataPackage(req.nextUrl.origin, ticker);
    if (dataPackage.fetchErrors.length >= 2) {
      // Thieu qua nhieu nguon du lieu that - khong du co so de debate co
      // y nghia, dung lai thay vi de AI "bia" tren du lieu rong.
      await prisma.debateSession.update({ where: { id: session.id }, data: { status: "failed", errorMessage: `Thiếu dữ liệu nguồn: ${dataPackage.fetchErrors.join(", ")}` } });
      return NextResponse.json({ error: "Không đủ dữ liệu thật để chạy debate (thiếu quá nhiều nguồn)." }, { status: 422 });
    }
    const dataPackageJson = JSON.stringify(dataPackage, null, 2);

    // Luot 1: Bull (Claude) dua luan diem ban dau
    const bullRound1 = await runBullAgent(dataPackageJson);
    // Luot 2: Bear (Gemini) doc Bull, phan bien
    const bearRound1 = await runBearAgent(dataPackageJson, bullRound1.argument);
    // Luot 3: Bull (Claude) phan hoi lai Bear
    const bullRound2 = await runBullAgent(dataPackageJson, bearRound1.argument);

    const trades = [
      { side: "bull" as const, confidencePct: bullRound1.confidencePct },
      { side: "bear" as const, confidencePct: bearRound1.confidencePct },
      { side: "bull" as const, confidencePct: bullRound2.confidencePct },
    ];
    const lmsrResult = runLmsrSession(trades);

    const rounds = [
      { round: 1, side: "bull", model: DEBATE_MODEL_NAME, argument: bullRound1.argument, confidencePct: bullRound1.confidencePct, citedFields: bullRound1.citedFields },
      { round: 1, side: "bear", model: DEBATE_MODEL_NAME, argument: bearRound1.argument, confidencePct: bearRound1.confidencePct, citedFields: bearRound1.citedFields },
      { round: 2, side: "bull", model: DEBATE_MODEL_NAME, argument: bullRound2.argument, confidencePct: bullRound2.confidencePct, citedFields: bullRound2.citedFields },
    ];

    await prisma.debateSession.update({
      where: { id: session.id },
      data: {
        status: "completed", rounds,
        lmsrQYes: lmsrResult.finalState.qYes, lmsrQNo: lmsrResult.finalState.qNo,
        lmsrFinalPricePct: lmsrResult.finalPriceYesPct,
      },
    });

    // Giai doan 3: Jury of Judges - 2 Judge doc lap (Gemini, temperature
    // khac nhau) doc toan bo transcript + LMSR, phan quyet khach quan.
    const judgeVotes = await runJury(rounds, lmsrResult.finalPriceYesPct);
    const { finalVerdict, isTieBreak, avgConfidencePct } = resolveJuryVerdict(judgeVotes);

    await prisma.debateSession.update({
      where: { id: session.id },
      data: { judgeVotes: judgeVotes as unknown as Prisma.InputJsonValue, finalVerdict },
    });

    return NextResponse.json({
      sessionId: session.id, ticker, status: "completed",
      rounds, lmsrFinalPricePct: lmsrResult.finalPriceYesPct,
      judgeVotes, finalVerdict, isTieBreak, avgConfidencePct,
      dataSourcesUsed: 3 - dataPackage.fetchErrors.length, dataSourcesTotal: 3,
      isSingleProviderDebate: IS_SINGLE_PROVIDER_DEBATE, isSingleProviderJury: IS_SINGLE_PROVIDER_JURY,
      note: `Cả Bull, Bear và 2 Judge đều dùng ${DEBATE_MODEL_NAME} (vai trò khác nhau qua system prompt + temperature khác nhau cho Judge, KHÔNG PHẢI các model độc lập như thiết kế ban đầu Claude vs Gemini vs GPT) — xem "isSingleProviderDebate"/"isSingleProviderJury". finalVerdict là phán quyết của Jury (không phải trung bình cộng đơn giản của Bull/Bear); nếu "isTieBreak"=true nghĩa là 2 Judge bất đồng, đã chọn theo Judge tự tin hơn.`,
    });
  } catch (err) {
    console.error("[api/elite10/debate] Lỗi:", err);
    if (sessionId) {
      await prisma.debateSession.update({ where: { id: sessionId }, data: { status: "failed", errorMessage: err instanceof Error ? err.message : "Lỗi không xác định" } }).catch(() => {});
    }
    return NextResponse.json({ error: "Không thể chạy Debate AI lúc này." }, { status: 500 });
  }
}

// GET: xem lai debate GAN NHAT cua 1 ma (khong chay moi, chi doc DB)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  try {
    const { ticker: tickerParam } = await params;
    const ticker = tickerParam.toUpperCase();
    const latest = await prisma.debateSession.findFirst({ where: { ticker }, orderBy: { createdAt: "desc" } });
    if (!latest) return NextResponse.json({ error: "Chưa có debate nào cho mã này." }, { status: 404 });
    return NextResponse.json(latest);
  } catch (err) {
    console.error("[api/elite10/debate GET] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tải debate lúc này." }, { status: 500 });
  }
}
