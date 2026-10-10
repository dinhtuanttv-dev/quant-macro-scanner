// Giai Trinh Hoi Tu - Giai doan 1a: tach logic tinh Top 20 Loc Nganh tu
// app/api/sector-filter/top20/route.ts THANH 1 HAM DUNG CHUNG - de CA
// route goc (nguoi dung goi truc tiep, tra ve ngay) VA cron moi (chay
// dinh ky, luu vao DB) deu goi CUNG 1 logic, KHONG COPY-PASTE.
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";
import {
  extractCloses, calculateRelativeStrength, calculateVolumeSpikeRatio,
  calculatePVTTrendScore, calculateADTrendScore,
} from "@/lib/market-data/technical-indicators";
import { stockUniverse } from "@/lib/quant-data";
import { rankTop20, type ConfluenceInput, type ConfluenceResult } from "@/lib/sector-filter/scoring/confluence-score";
import { fetchIcbQuadrantMap } from "@/lib/sector-filter/gateway-quadrants";
import { calculateRiskOnIndex } from "@/lib/scoring/weighted-macro-score";
import { createServiceClient } from "@/lib/supabase/client";
import { MARKET_GATEWAY_URL } from "@/lib/market-data/ssi-gateway-adapter";

const BATCH_SIZE = 18;
const TICKER_SECTOR_MAP: Record<string, string> = {};
stockUniverse.forEach((s: any) => { TICKER_SECTOR_MAP[s.ticker] = s.sector; });

export async function fetchRiskOnScore(): Promise<number> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("world_macro_trends").select("dxy, vix, treasury_10y")
      .order("fetched_at", { ascending: false }).limit(1).maybeSingle();
    if (!data || data.dxy == null || data.vix == null || data.treasury_10y == null) {
      console.warn("[top20] Khong lay duoc du lieu vi mo moi nhat de tinh Risk-On Index - dung trong so trung lap (score=50).");
      return 50;
    }
    return calculateRiskOnIndex({ dxy: data.dxy, vix: data.vix, treasury10y: data.treasury_10y }).score;
  } catch (err) {
    console.error("[top20] Loi lay Risk-On Index, dung trong so trung lap (score=50):", err);
    return 50;
  }
}

export interface Top20Result {
  generatedAt: string;
  totalAnalyzed: number;
  riskOnScore: number;
  top20: ConfluenceResult[];
  /** T0 (2026-10-10): nguồn dữ liệu thật của lần tính. */
  dataSource?: { provider: "GATEWAY_TOP20_INPUTS" | "YAHOO_LEGACY"; priceBasis: string; dataAsOf: string | null; universe: number; liquid: number; fallbackReason?: string };
  evidence?: { label: string; reason: string };
}

// T0: điểm hội tụ CHƯA qua kiểm định ngoài mẫu — kiểm định khám phá 2026-10-10 (251 mã, 2022-10 → 2026-09): IC 20 phiên ≈ −0,004.
export const TOP20_EVIDENCE = {
  label: "EXPERIMENTAL",
  reason: "Điểm hội tụ chưa qua kiểm định đặt trước. Kiểm định khám phá 10/10/2026 (251 mã, 10/2022–09/2026): tương quan hạng với lợi suất vượt VN-Index 20 phiên ≈ −0,004 — chưa có năng lực chọn mã. Đang xây Top 20 v2 (T1–T5).",
};

interface GatewayTop20Inputs {
  engine: string; dataAsOf: string | null; priceBasis: string; count: number; liquid: number;
  tickers: { ticker: string; rs3m: number | null; volumeSpikeRatio: number | null; pvtScore: number | null; adScore: number | null; avgValue60: number; liquid: boolean; stale: boolean }[];
}

async function fetchGatewayInputs(fetchImpl: typeof fetch = fetch): Promise<GatewayTop20Inputs> {
  const r = await fetchImpl(`${MARKET_GATEWAY_URL}/api/market/top20/inputs`, { cache: "no-store", signal: AbortSignal.timeout(50_000) });
  if (!r.ok) throw new Error(`Gateway top20/inputs HTTP ${r.status}`);
  const j = (await r.json()) as GatewayTop20Inputs;
  if (!Array.isArray(j?.tickers) || j.tickers.length < 50) throw new Error(`Gateway top20/inputs chỉ có ${j?.tickers?.length ?? 0} mã`);
  return j;
}

/**
 * T0: thành phần từ Gateway (chuỗi điều chỉnh cộng dồn, cả universe, GTGD TB60 ≥ 5 tỷ, bỏ mã dừng giao dịch); chấm điểm giữ nguyên
 * (rankTop20). Gateway lỗi -> rơi về đường Yahoo cũ, có ghi lý do (dataSource.fallbackReason).
 */
export async function computeSectorTop20(filterSectorKey?: string | null, fetchImpl: typeof fetch = fetch): Promise<Top20Result> {
  const [icb, riskOnScore, gw] = await Promise.all([
    fetchIcbQuadrantMap(fetchImpl),
    fetchRiskOnScore(),
    fetchGatewayInputs(fetchImpl).then((v) => ({ ok: true as const, v }), (e) => ({ ok: false as const, e })),
  ]);
  if (!gw.ok) {
    const legacy = await computeSectorTop20Legacy(filterSectorKey, icb, riskOnScore);
    return { ...legacy, evidence: TOP20_EVIDENCE, dataSource: { provider: "YAHOO_LEGACY", priceBasis: "YAHOO_CLOSE_UNADJUSTED", dataAsOf: null, universe: legacy.totalAnalyzed, liquid: legacy.totalAnalyzed, fallbackReason: String((gw.e as Error)?.message ?? gw.e) } };
  }
  const inputs: ConfluenceInput[] = [];
  for (const t of gw.v.tickers) {
    if (!t.liquid || t.stale) continue;
    const icbSector = icb.of(t.ticker);
    const sectorKey = icbSector?.code ?? TICKER_SECTOR_MAP[t.ticker] ?? "OTHER";
    if (filterSectorKey && sectorKey !== filterSectorKey && TICKER_SECTOR_MAP[t.ticker] !== filterSectorKey) continue;
    inputs.push({
      ticker: t.ticker, sectorKey, sectorQuadrant: icbSector?.quadrant ?? "Lagging", icbCode: icbSector?.code ?? null, icbName: icbSector?.name ?? null,
      rs3m: t.rs3m, volumeSpikeRatio: t.volumeSpikeRatio, pvtScore: t.pvtScore, adScore: t.adScore,
    });
  }
  const top20 = rankTop20(inputs, riskOnScore);
  return {
    generatedAt: new Date().toISOString(), totalAnalyzed: inputs.length, riskOnScore, top20, evidence: TOP20_EVIDENCE,
    dataSource: { provider: "GATEWAY_TOP20_INPUTS", priceBasis: gw.v.priceBasis, dataAsOf: gw.v.dataAsOf, universe: gw.v.count, liquid: gw.v.liquid },
  };
}

/** Đường cũ (Yahoo 6 tháng, 61 mã stockUniverse) — CHỈ dùng khi Gateway lỗi. */
async function computeSectorTop20Legacy(filterSectorKey: string | null | undefined, icb: Awaited<ReturnType<typeof fetchIcbQuadrantMap>>, riskOnScore: number): Promise<Top20Result> {
  const vnResult = await fetchOhlcvHistory("^VNINDEX.VN", "6mo");


  const vnCloses = vnResult.success && vnResult.data ? extractCloses(vnResult.data) : [];

  const tickers = stockUniverse.map((s: any) => s.ticker);
  const inputs: ConfluenceInput[] = [];

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((t: string) => fetchOhlcvHistory(t, "6mo")));

    results.forEach((res, bi) => {
      const ticker = batch[bi];
      if (!res.success || !res.data || res.data.length < 60) return;

      const sectorKey = TICKER_SECTOR_MAP[ticker] ?? "OTHER";
      // L5: góc phần tư = góc của NGÀNH ICB cấp 2 chứa mã (RRG tuần Gateway); bộ lọc nhận mã ICB (4 số) hoặc tên ngành cũ
      const icbSector = icb.of(ticker);
      if (filterSectorKey && sectorKey !== filterSectorKey && icbSector?.code !== filterSectorKey) return;

      const closes = extractCloses(res.data);
      const rs3m = vnCloses.length > 0 ? calculateRelativeStrength(closes, vnCloses, 63) : null;
      const volumeSpikeRatio = calculateVolumeSpikeRatio(res.data, 20);
      const pvtScore = calculatePVTTrendScore(res.data, 20);
      const adScore = calculateADTrendScore(res.data, 20);

      inputs.push({
        ticker, sectorKey, sectorQuadrant: icbSector?.quadrant ?? "Lagging", icbCode: icbSector?.code ?? null, icbName: icbSector?.name ?? null,
        rs3m, volumeSpikeRatio, pvtScore, adScore,
      });
    });

    if (i + BATCH_SIZE < tickers.length) await new Promise((r) => setTimeout(r, 150));
  }

  const top20 = rankTop20(inputs, riskOnScore);
  return { generatedAt: new Date().toISOString(), totalAnalyzed: inputs.length, riskOnScore, top20 };
}
