// lib/catalyst/marketSignals.ts
// Nối MarketSignal với dữ liệu giá/khối lượng THẬT — nhưng chỉ nối đúng những field
// project thực sự có nguồn dữ liệu. Các field không có nguồn được giữ mặc định trung lập
// và ghi chú rõ, KHÔNG bịa số để trông như có dữ liệu thật.
//
// X1 (2026-10-16): nguồn giá chuyển từ Yahoo sang Market Gateway (lib/catalyst/gatewaySignals.ts) — giá ĐIỀU CHỈNH,
// universe Siêu Quét ~276 mã, một lần gọi. liquidityScore nay là dữ liệu THẬT (hạng phân vị GTGD 60 phiên).
// Có dữ liệu thật: priceInStatus (proxy qua Relative Strength 63 phiên), volumeFlag (dòng tiền bất thường so với thị trường)
// MOI (2026-09-11): foreignFlowDirection = "buy" cho 5 ma xuat hien trong
// bang "Giao dich cua NDTNN - mua rong" cua ban tin HOSE hang ngay (bang
// hose_foreign_net_buy, ghi boi lib/ingestion/hose/hose-ingest.ts). CHI co
// "buy", KHONG co "sell" - ban tin HOSE khong cong bo danh sach ban rong
// tuong ung, gan "sell" cho ma con lai se la suy dien khong co can cu.
// CHƯA có dữ liệu: valuationPercentile (giữ trung lập 0.5).
// Mã không có trong universe Gateway -> giữ mặc định trung lập, KHÔNG bịa số.

import { prisma } from "@/lib/prisma";
import { fetchGatewaySignalInputs, type GatewaySignalInputs } from "./gatewaySignals";
import type { MarketSignal } from "./types";

export function inferPriceInStatus(rs3m: number | null): "reflected" | "not_reflected" {
  if (rs3m === null) return "not_reflected";
  return rs3m > 5 ? "reflected" : "not_reflected";
}

export function inferVolumeFlag(volumeSpikeRatio: number | null): "confirmed" | "suspicious" | "none" {
  if (volumeSpikeRatio === null) return "none";
  return volumeSpikeRatio >= 1.5 ? "confirmed" : "none";
}

// Doc bang cache 1-dong hose_foreign_net_buy - tra ve Set rong (khong loi)
// neu bang chua co du lieu (chua chay cron lan nao) hoac loi ket noi, de
// KHONG lam sap ca luong chinh vi 1 phan nho khong quan trong bang.
async function fetchForeignNetBuySet(): Promise<Set<string>> {
  try {
    const rows = await prisma.$queryRaw<{ tickers: unknown }[]>`
      SELECT tickers FROM hose_foreign_net_buy WHERE id = 'latest' LIMIT 1
    `;
    const tickers = rows[0]?.tickers;
    if (Array.isArray(tickers)) return new Set(tickers.map((t) => String(t)));
    return new Set();
  } catch (err) {
    console.error("[marketSignals] Loi doc hose_foreign_net_buy (bo qua, dung Set rong):", err);
    return new Set();
  }
}

/** Ghép tín hiệu thị trường từ đầu vào Gateway (thuần, để test). */
export function buildMarketSignals(tickers: string[], inputs: GatewaySignalInputs, foreignNetBuySet: Set<string>): Map<string, MarketSignal> {
  const map = new Map<string, MarketSignal>();
  for (const ticker of tickers) {
    const g = inputs.tickers.get(ticker);
    const usable = g && !g.stale;
    map.set(ticker, {
      ticker,
      priceInStatus: inferPriceInStatus(usable ? g.rs3m : null),
      volumeFlag: inferVolumeFlag(usable ? g.volumeSpikeRatio : null),
      foreignFlowDirection: foreignNetBuySet.has(ticker) ? "buy" : "none",
      valuationPercentile: 0.5,
      liquidityScore: inputs.liquidityRank.get(ticker) ?? 0.5,
      isWatchlisted: false,
    });
  }
  return map;
}

export async function fetchMarketSignalsReal(tickers: string[], inputs?: GatewaySignalInputs): Promise<Map<string, MarketSignal>> {
  if (tickers.length === 0) return new Map();
  const [g, foreignNetBuySet] = await Promise.all([inputs ? Promise.resolve(inputs) : fetchGatewaySignalInputs(), fetchForeignNetBuySet()]);
  if (!g.ok) console.error("[marketSignals] Gateway không trả đầu vào — dùng mặc định trung lập:", g.error);
  return buildMarketSignals(tickers, g, foreignNetBuySet);
}
