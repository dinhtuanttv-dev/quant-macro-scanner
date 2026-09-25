// Elite 10 - Adapter noi 6 tru cot (Pillar) voi DU LIEU THAT da co san
// trong du an, THAY THE app/data/mock_sources.py (ban goc). Cac tru cot
// CHUA CO adapter rieng (sector/catalyst) tra ve MISSING minh bach -
// KHONG bia signal_value.
import { prisma } from "@/lib/prisma";
import { Redis } from "@upstash/redis";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { SourceData } from "./quality-gate";
import type { ConfluenceProfile, TaMeta, MacroMeta, CatalystMeta } from "./confluence-scoring";
import { applyQualityGate } from "./quality-gate";
import { readSnapshotWithStaleness } from "@/lib/catalyst/engine/SnapshotStore";
import type { CatalystSnapshot } from "@/lib/catalyst/useCatalystData";
import type { MacroEventSummary } from "@/lib/types/siu-quet-ai";
import { getAsiaSectorPulseForSector } from "@/lib/global/sector-pulse-lookup";
import {
  generateCoreReasonText, generateTaReasonText, generateSectorReasonText,
  generateCatalystReasonText, generateMacroReasonText, generateDividendReasonText,
} from "./confluence-reason-text";

const catalystRedis = new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! });

function nowSec(): number { return Date.now() / 1000; }

function makeSource(pillar: string, signalValue: number | null, raw: Record<string, unknown> = {}): SourceData {
  return { pillar, signalValue, lastUpdate: nowSec(), rollingMean90d: 50, rollingStd90d: 10, raw };
}

/** Xay ConfluenceProfile cho 1 ma, doc TRUC TIEP tu cac bang Database
 * DA CO (khong qua Event Bus in-memory - khong tuong thich Vercel
 * serverless). Tru cot chua co adapter that -> signalValue=null (MISSING). */
export async function buildConfluenceProfile(ticker: string): Promise<ConfluenceProfile> {
  const [stockItem, indexState, dividendEntry, cachedOverrides, sectorEntry, catalystSnap] = await Promise.all([
    prisma.sieuQuetStockItem.findUnique({ where: { ticker } }),
    prisma.sieuQuetIndexState.findUnique({ where: { id: "singleton" } }),
    prisma.dividendUniverseEntry.findUnique({ where: { ticker } }).catch(() => null),
    prisma.confluenceSignalCache.findMany({ where: { ticker } }),
    // Giai doan 1b (Giai Trinh Hoi Tu): doc ket qua Top 20 Loc Nganh da
    // luu san boi cron sector-top20-scan (KHONG tinh realtime ~60s).
    prisma.sectorTop20Entry.findFirst({ where: { ticker } }).catch(() => null),
    // catalyst: doc snapshot Redis da co san (tickerImpacts + upcomingEvents),
    // KHONG can them ha tang moi - chi doc lai.
    readSnapshotWithStaleness<CatalystSnapshot>(catalystRedis).catch(() => ({ snapshot: null, isStale: false, ageMinutes: null })),
  ]);

  // Giai doan 2 (Giai Trinh Hoi Tu): hieu suat nganh Chau A THAT cho
  // pillar "macro" - PHU THUOC vao stockItem.sector nen phai goi SAU
  // (khong the gop chung Promise.all o tren vi chua co sector).
  const asiaSectorPulse = await getAsiaSectorPulseForSector(stockItem?.sector).catch(() => null);

  const overrideMap = new Map<string, { signalValue: number; rollingMean90d: number; rollingStd90d: number }>(
    cachedOverrides.map((c: { pillar: string; signalValue: number; rollingMean90d: number; rollingStd90d: number }) => [c.pillar, c])
  );

  // sector: NEU ma nam trong Top 20 (da tinh san, confluenceScore la
  // thang 0-100 CHUAN HOA) -> dung lam signalValue THAT. NEU KHONG
  // nam trong Top 20 (khong co du lieu confluenceScore rieng cho ma
  // do) -> MISSING minh bach, KHONG bia diem thap gia dinh.
  const sectorSignal = sectorEntry?.confluenceScore ?? null;

  // catalyst: doc tickerImpacts[ticker] (direction + compositeScore da
  // tinh san boi CatalystEngine that). compositeScore GIA DINH thang
  // -100..+100 (benefit/harm) - chuan hoa ve 0-100 cho dong bo voi cac
  // pillar khac (50 = trung tinh).
  const impact = catalystSnap.snapshot?.tickerImpacts?.[ticker];
  const catalystSignal = impact && impact.direction !== "none"
    ? Math.max(0, Math.min(100, 50 + impact.compositeScore / 2))
    : null;
  const relatedEvents = (catalystSnap.snapshot?.upcomingEvents ?? []).filter(
    (e: MacroEventSummary) => impact?.direction && e.direction === impact.direction
  ).slice(0, 2);

  const sources: Record<string, SourceData> = {
    // core - Sieu Quet AI: Smart Score da tinh THAT (Confluence Engine rieng)
    core: makeSource("core", stockItem?.smartScore ?? null, {
      trendTag: stockItem?.trendTag, confluenceStatus: stockItem?.confluenceStatusLabel,
      foreignNetBuyFlag: stockItem?.foreignNetBuyFlag ?? false,
      reasonText: generateCoreReasonText({
        trendTag: stockItem?.trendTag, foreignNetBuyFlag: stockItem?.foreignNetBuyFlag ?? false,
        confluenceStatus: stockItem?.confluenceStatusLabel,
      }),
    }),
    // ta - TA VN-Index: dung taScore THAT da tinh (Yahoo OHLCV, RSI/MA/liquidity)
    // - LUU Y: day la Confluence "ta" o muc Sieu Quet AI, KHAC voi
    // SMC/Wyckoff/Elliott cua tab TA VN-Index rieng (van con mock, xem
    // MockDataBanner.tsx) - fvg_count/smc_ob_count van null (MISSING that su).
    ta: makeSource("ta", stockItem?.taScore ?? null, {
      rsRating: stockItem?.rsRating, smc_ob_count: null, fvg_count: null,
      reasonText: generateTaReasonText({ rsRating: stockItem?.rsRating }),
    }),
    // macro - dung Impulse Score cua VN-Index THAT lam proxy vi mo chung,
    // + Giai doan 2: hieu suat nganh Chau A THAT (sector-pulse-lookup).
    macro: makeSource("macro", indexState?.impulseScore ?? null, {
      foreign_flow: null, foreign_flow_desc: null, lag_days: null,
      sector: stockItem?.sector ?? null,
      reasonText: generateMacroReasonText({ sector: stockItem?.sector, asiaSectorPulse }),
    }),
    // dividend - Dividend Quality Score THAT (4 tang, Tab Co Tuc) neu co trong Universe
    dividend: makeSource("dividend", dividendEntry?.overallScoreTier123 ?? null, {
      yield_pct: dividendEntry?.dividendYieldPct ?? null,
      reasonText: generateDividendReasonText({ yieldPct: dividendEntry?.dividendYieldPct }),
    }),
    // sector - Giai doan 1b (Giai Trinh Hoi Tu): Top 20 Loc Nganh THAT
    // (cron dinh ky), MISSING minh bach neu ma khong nam trong Top 20.
    sector: makeSource("sector", sectorSignal, {
      rank: sectorEntry?.rank ?? null, sectorQuadrant: sectorEntry?.sectorQuadrant ?? null,
      rs3m: sectorEntry?.rs3m ?? null, sectorKey: sectorEntry?.sectorKey ?? null,
      reasonText: generateSectorReasonText({
        rank: sectorEntry?.rank, sectorQuadrant: sectorEntry?.sectorQuadrant,
        rs3m: sectorEntry?.rs3m, sectorKey: sectorEntry?.sectorKey,
      }),
    }),
    // catalyst - Giai doan 1b: doc tu Redis snapshot CatalystEngine THAT,
    // MISSING minh bach neu chua co impact nao ghi nhan cho ma nay.
    catalyst: makeSource("catalyst", catalystSignal, {
      direction: impact?.direction ?? null,
      relatedEvents: relatedEvents.map((e: MacroEventSummary) => ({ title: e.title, daysRemaining: e.daysRemaining, category: e.category })),
      reasonText: generateCatalystReasonText({
        direction: impact?.direction,
        relatedEvents: relatedEvents.map((e: MacroEventSummary) => ({ title: e.title, daysRemaining: e.daysRemaining, category: e.category })),
      }),
    }),
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
