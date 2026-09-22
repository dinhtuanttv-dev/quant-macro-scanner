// Elite 10 - Adapter noi 6 tru cot (Pillar) voi DU LIEU THAT da co san
// trong du an, THAY THE app/data/mock_sources.py (ban goc). Cac tru cot
// CHUA CO adapter rieng (sector/catalyst) tra ve MISSING minh bach -
// KHONG bia signal_value.
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { SourceData } from "./quality-gate";
import type { ConfluenceProfile, TaMeta, MacroMeta, CatalystMeta } from "./confluence-scoring";
import { applyQualityGate } from "./quality-gate";

function nowSec(): number { return Date.now() / 1000; }

function makeSource(pillar: string, signalValue: number | null, raw: Record<string, unknown> = {}): SourceData {
  return { pillar, signalValue, lastUpdate: nowSec(), rollingMean90d: 50, rollingStd90d: 10, raw };
}

/** Xay ConfluenceProfile cho 1 ma, doc TRUC TIEP tu cac bang Database
 * DA CO (khong qua Event Bus in-memory - khong tuong thich Vercel
 * serverless). Tru cot chua co adapter that -> signalValue=null (MISSING). */
export async function buildConfluenceProfile(ticker: string): Promise<ConfluenceProfile> {
  const [stockItem, indexState, dividendEntry, cachedOverrides] = await Promise.all([
    prisma.sieuQuetStockItem.findUnique({ where: { ticker } }),
    prisma.sieuQuetIndexState.findUnique({ where: { id: "singleton" } }),
    prisma.dividendUniverseEntry.findUnique({ where: { ticker } }).catch(() => null),
    prisma.confluenceSignalCache.findMany({ where: { ticker } }),
  ]);

  const overrideMap = new Map<string, { signalValue: number; rollingMean90d: number; rollingStd90d: number }>(
    cachedOverrides.map((c) => [c.pillar, c])
  );

  const sources: Record<string, SourceData> = {
    // core - Sieu Quet AI: Smart Score da tinh THAT (Confluence Engine rieng)
    core: makeSource("core", stockItem?.smartScore ?? null, {
      trendTag: stockItem?.trendTag, confluenceStatus: stockItem?.confluenceStatusLabel,
    }),
    // ta - TA VN-Index: dung taScore THAT da tinh (Yahoo OHLCV, RSI/MA/liquidity)
    // - LUU Y: day la Confluence "ta" o muc Sieu Quet AI, KHAC voi
    // SMC/Wyckoff/Elliott cua tab TA VN-Index rieng (van con mock, xem
    // MockDataBanner.tsx) - fvg_count/smc_ob_count van null (MISSING that su).
    ta: makeSource("ta", stockItem?.taScore ?? null, {
      rsRating: stockItem?.rsRating, smc_ob_count: null, fvg_count: null,
    }),
    // macro - dung Impulse Score cua VN-Index THAT lam proxy vi mo chung
    macro: makeSource("macro", indexState?.impulseScore ?? null, {
      foreign_flow: null, foreign_flow_desc: null, lag_days: null,
    }),
    // dividend - Dividend Quality Score THAT (4 tang, Tab Co Tuc) neu co trong Universe
    dividend: makeSource("dividend", dividendEntry?.overallScoreTier123 ?? null, {
      yield_pct: dividendEntry?.dividendYieldPct ?? null,
    }),
    // sector, catalyst - CHUA CO ADAPTER RIENG (can Top20 Loc Nganh + Chat
    // Xuc Tac chuan hoa 0-100) - MISSING minh bach, KHONG bia
    sector: makeSource("sector", null, { note: "Chưa tích hợp — cần adapter Top20 Lọc Ngành" }),
    catalyst: makeSource("catalyst", null, { note: "Chưa tích hợp — cần adapter Chất Xúc Tác" }),
  };

  // Ap dung override tu cache (neu co dieu chinh thu cong/tu nguon khac)
  for (const [pillar, cache] of overrideMap.entries()) {
    if (sources[pillar]) {
      sources[pillar].signalValue = cache.signalValue;
      sources[pillar].rollingMean90d = cache.rollingMean90d;
      sources[pillar].rollingStd90d = cache.rollingStd90d;
    }
  }

  applyQualityGate(sources, nowSec());

  const taMeta: TaMeta = {
    eliteConvergenceScore: stockItem?.smartScore ?? undefined,
    referencePrice: stockItem?.price ?? undefined,
    // volumeProfileDivergence, vpinProxy, elliottAltCounts, indicatorSeries:
    // CHUA CO NGUON THAT (can tick/order-book data hoac model Elliott/
    // Wyckoff that) - de undefined, KHONG bia.
  };
  const macroMeta: MacroMeta = {}; // foreignFlow: can adapter rieng noi voi hose_foreign_net_buy
  const catalystMeta: CatalystMeta = {}; // newsPumpAnomaly: can NLP that, chua co

  const maxLagSec = Math.max(0, ...Object.values(sources).map((s) => nowSec() - s.lastUpdate));

  return {
    ticker, sources,
    syncStatus: maxLagSec <= 5 ? "OK" : "DEGRADED",
    maxLagSec: Math.round(maxLagSec * 100) / 100,
    taMeta, macroMeta, catalystMeta,
  };
}

/** Ghi 1 tin hieu vao cache (thay the viec "publish vao Event Bus") -
 * dung khi mot module KHAC (VD adapter Loc Nganh/Chat Xuc Tac tuong lai)
 * muon cung cap tin hieu cho pillar cua minh. */
export async function publishSignal(ticker: string, pillar: string, signalValue: number, raw: Record<string, unknown> = {}): Promise<void> {
  const rawJson = raw as Prisma.InputJsonValue;
  await prisma.confluenceSignalCache.upsert({
    where: { ticker_pillar: { ticker, pillar } },
    create: { ticker, pillar, signalValue, raw: rawJson },
    update: { signalValue, raw: rawJson },
  });
}
