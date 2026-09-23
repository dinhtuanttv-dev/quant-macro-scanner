import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildConfluenceProfile } from "@/lib/elite10/confluence-adapter";
import { computeConfluenceScore, type MarketRegime } from "@/lib/elite10/confluence-scoring";
import { riskFlagsFor } from "@/lib/elite10/trap-detector";

// Elite 10 - Vung 1-6 "Giai Trinh Hoi Tu v2": tinh Confluence Score THAT
// (Data Quality Gate + Scoring Engine + Trap Detector + Cross Tab + AI
// Pipeline), ghi Audit Log + Score History (Prisma/Postgres thay SQLite).
export const dynamic = "force-dynamic";

const PILLAR_LABEL: Record<string, string> = {
  core: "Siêu quét AI", ta: "TA VN-Index", sector: "Lọc ngành",
  catalyst: "Chất xúc tác", macro: "Kết nối thế giới (VN-Index)", dividend: "Cổ tức",
};
const PILLAR_ORDER = ["core", "ta", "sector", "catalyst", "macro", "dividend"];

async function getTopNForTab(tab: string, n: number): Promise<string[]> {
  if (tab === "core") {
    const items = await prisma.sieuQuetStockItem.findMany({ orderBy: { smartScore: "desc" }, take: n });
    return items.map((i) => i.ticker);
  }
  // sector/catalyst/ta/macro/dividend: CHUA CO adapter Top-N rieng - tra ve rong
  return [];
}

export async function GET(req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  try {
    const { ticker: tickerParam } = await params;
    const ticker = tickerParam.toUpperCase();
    const { searchParams } = new URL(req.url);
    const regime = (searchParams.get("regime") ?? "trending") as MarketRegime;
    const profileId = searchParams.get("profile") ?? "default";

    const profile = await buildConfluenceProfile(ticker);

    const recentRows = await prisma.confluenceScoreHistory.findMany({
      where: { ticker }, orderBy: { id: "desc" }, take: 20,
    });
    const recentScores = recentRows.map((r) => r.score);

    const result = computeConfluenceScore(profile, regime, profileId, recentScores);

    // Cross-tab THAT: hien tai chi 'core' (Sieu Quet AI Smart Score) co
    // Top-N that san sang; cac tab khac chua co adapter Top-N rieng.
    const coreTop = await getTopNForTab("core", 20);
    const matchedTabs = coreTop.includes(ticker) ? ["core"] : [];

    const flags = riskFlagsFor(profile);

    // MOI (ra soat 2026-09-17): tra ve chi tiet TUNG PILLAR (status/gia
    // tri/trong so) de Frontend hien thi DUNG tung nguon, thay vi chi co
    // tong diem - can thiet de noi ConfluencePanel voi du lieu THAT.
    const sourcesDetail = PILLAR_ORDER.map((pillar) => {
      const src = profile.sources[pillar];
      const status = src?.status ?? "MISSING";
      const weightPct = result.weightsEffective[pillar] !== undefined ? Math.round(result.weightsEffective[pillar] * 1000) / 10 : null;
      let detail: string;
      if (status === "MISSING") detail = "Chưa tích hợp";
      else if (status === "STALE") detail = "Dữ liệu cũ";
      else if (status === "SUSPECT") detail = `${src?.signalValue?.toFixed(1) ?? "—"} (bất thường)`;
      else detail = src?.signalValue !== null && src?.signalValue !== undefined ? src.signalValue.toFixed(1) : "—";
      return {
        key: pillar, name: PILLAR_LABEL[pillar] ?? pillar,
        status: status === "VALID" ? "ok" : status === "SUSPECT" ? "warn" : status === "STALE" ? "warn" : "no_data",
        detail, weightPct, isCurrentTab: pillar === "ta",
      };
    });

    await prisma.confluenceAuditLog.create({
      data: {
        ticker, profileId, regime,
        weightsEffective: result.weightsEffective, nAvailable: result.nAvailable,
        penaltyTotal: result.penalty.total, penaltyBreakdown: result.penalty.breakdown,
        score: result.score, ciLow: result.ci[0], ciHigh: result.ci[1],
        starRating: result.star, riskFlags: flags,
      },
    });
    await prisma.confluenceScoreHistory.create({ data: { ticker, score: result.score } });

    // Nen tang Outcome-Tracking (Tech Spec v2, dieu kien tien quyet cho
    // Conformal Prediction/Concept-Drift/PBO/Thompson Sampling ve sau):
    // ghi 1 "du bao" MOI neu CHUA CO ban ghi pending nao cho ticker nay
    // trong 24h gan nhat (tranh trung lap khi nguoi dung xem di xem lai
    // cung 1 ma) VA co gia tham chieu that (khong bia gia). Cron rieng
    // se cham dung/sai sau horizonDays - KHONG lam gi them o day.
    const referencePrice = profile.taMeta.referencePrice;
    if (referencePrice !== undefined && referencePrice !== null && referencePrice > 0) {
      const recentPending = await prisma.insightOutcome.findFirst({
        where: { ticker, status: "pending", predictedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      });
      if (!recentPending) {
        await prisma.insightOutcome.create({
          data: { ticker, predictedScore: result.score, starRating: result.star, priceAtPrediction: referencePrice, horizonDays: 20 },
        });
      }
    }

    return NextResponse.json({
      ticker, score: result.score, confidenceInterval: result.ci,
      sourcesUsed: `${result.nAvailable}/6`, nAvailable: result.nAvailable,
      penalty: result.penalty, starRating: result.star, regime, profileId,
      weightsEffective: Object.fromEntries(Object.entries(result.weightsEffective).map(([k, v]) => [k, Math.round(v * 1000) / 1000])),
      sources: sourcesDetail,
      crossTabConvergence: matchedTabs.length, crossTabMatched: matchedTabs,
      riskFlags: flags, syncStatus: profile.syncStatus, maxLagSec: profile.maxLagSec,
      // MINH BACH (ra soat 2026-09-17): sector/catalyst chua co adapter,
      // Cross-Tab chi 5/6 pillar co Top-N that, Bull Trap can 4 dieu kien
      // phu (foreign_flow/volume/vpin/news) ma 3/4 chua co nguon that.
      limitationsNote: "Sector và Chất xúc tác chưa có adapter riêng (MISSING). Hội tụ chéo chỉ khả dụng đầy đủ cho nguồn core (Siêu quét AI). Cảnh báo bull trap cần thêm dữ liệu khối ngoại/volume/tick — hiện chỉ dựa 1 phần điều kiện.",
    });
  } catch (err) {
    console.error("[api/elite10/confluence] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tính Điểm Hội Tụ lúc này." }, { status: 500 });
  }
}
