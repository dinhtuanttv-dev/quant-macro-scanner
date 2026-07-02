"use client";

import { useState } from "react";
import { ShieldAlert, Sliders, PieChart, TrendingUp, TrendingDown, Minus, CheckCircle2, RefreshCw, Sparkles, AlertCircle, Bot } from "lucide-react";
import type { Tang3Stock } from "@/lib/quant-funnel";
import { useMarketData } from "@/lib/market-data/useMarketData";
import { useBlackSwan } from "@/lib/market-data/useBlackSwan";

interface SectorCatalyst {
  name: string;
  catalyst: string;
  status: "Strong Positive" | "Positive" | "Neutral";
  strength: number;
  flow: string;
}

interface BlackSwanEvent {
  event: string;
  channel: string;
  impact: string;
}

interface SectorsTabProps {
  sectorsData: SectorCatalyst[];
  blackSwans: BlackSwanEvent[];
  tang3Result: Tang3Stock[];
  setSelectedStockId: (ticker: string) => void;
  setActiveTab: (tab: string) => void;
}

function computeSectorRsFromReal(
  marketData: ReturnType<typeof useMarketData>["marketData"],
  sectorName: string,
  tang3Result: Tang3Stock[]
): { rsAvg: number | null; tickerCount: number } {
  if (!marketData) return { rsAvg: null, tickerCount: 0 };
  const sectorTickers = tang3Result.filter((s) => s.sector === sectorName).map((s) => s.ticker);
  const rsValues = sectorTickers
    .map((ticker) => marketData.tickers.find((t) => t.ticker === ticker)?.relativeStrength3m)
    .filter((v): v is number => v !== null && v !== undefined);
  const rsAvg = rsValues.length > 0
    ? Math.round((rsValues.reduce((a, b) => a + b, 0) / rsValues.length) * 10) / 10
    : null;
  return { rsAvg, tickerCount: sectorTickers.length };
}

function rsToStrength(rs: number | null, fallback: number): number {
  if (rs === null) return fallback;
  return Math.round(Math.max(5, Math.min(95, 50 + rs * 2.25)));
}

const SEVERITY_CONFIG = {
  critical: { color: "#f87171", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.3)", label: "Nguy hiem cao" },
  high: { color: "#fb923c", bg: "rgba(251,146,60,0.06)", border: "rgba(251,146,60,0.25)", label: "Rui ro cao" },
  medium: { color: "#fbbf24", bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.2)", label: "Can theo doi" },
  low: { color: "#94a3b8", bg: "rgba(148,163,184,0.04)", border: "rgba(148,163,184,0.15)", label: "Theo doi nhe" },
};

export default function SectorsTab({
  sectorsData, blackSwans, tang3Result, setSelectedStockId, setActiveTab,
}: SectorsTabProps) {
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const { marketData } = useMarketData(60);
  const { blackSwanData, isLoading: bsLoading, refresh: bsRefresh } = useBlackSwan();

  const isRealData = !!marketData;

  const enrichedSectors = sectorsData.map((sector) => {
    const { rsAvg } = computeSectorRsFromReal(marketData, sector.name, tang3Result);
    const realStrength = rsToStrength(rsAvg, sector.strength);
    return {
      ...sector,
      strength: isRealData ? realStrength : sector.strength,
      rsAvg,
      isReal: isRealData && rsAvg !== null,
    };
  }).sort((a, b) => b.strength - a.strength);

  const top20Stocks = [...tang3Result]
    .map((s) => {
      const realTicker = marketData?.tickers.find((t) => t.ticker === s.ticker);
      const rsBonus = realTicker?.relativeStrength3m ?? 0;
      const volBonus = realTicker?.volumeSpikeRatio ? Math.min(realTicker.volumeSpikeRatio, 2) * 3 : 0;
      const ma50Penalty = realTicker?.ma50Status === "broken" ? -20 : realTicker?.ma50Status === "warning" ? -5 : 0;
      const compositeScore = s.tang3Score + rsBonus * 0.5 + volBonus + ma50Penalty;
      return {
        ...s,
        compositeScore: Math.round(compositeScore * 10) / 10,
        rs: realTicker?.relativeStrength3m ?? null,
        ma50Status: realTicker?.ma50Status ?? null,
        volSpike: realTicker?.volumeSpikeRatio ?? null,
        isReal: !!realTicker && !realTicker.error,
      };
    })
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, 20);

  const foreignNetTotal = marketData?.tickers
    .filter((t) => !t.error)
    .reduce((sum, t) => sum + (t.relativeStrength3m ?? 0), 0) ?? 0;

  const isPositiveForeignFlow = foreignNetTotal > 0;
  const foreignPct = Math.round(35 + (isPositiveForeignFlow ? 5 : -5));
  const institutionalPct = Math.round(28 + (isPositiveForeignFlow ? 3 : -3));
  const hnwPct = 20;
  const retailPct = 100 - foreignPct - institutionalPct - hnwPct;

  const statusColor = (status: string) =>
    status === "Strong Positive" ? "#34d399" : status === "Positive" ? "#fbbf24" : "#94a3b8";

  const strengthColor = (strength: number) =>
    strength >= 75 ? "#34d399" : strength >= 50 ? "#fbbf24" : "#f87171";

  const displayScenarios = blackSwanData?.scenarios ?? blackSwans;

  return (
    <div className="space-y-6">

      {/* 1. SUC MANH NGANH */}
      <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold uppercase text-slate-100 flex items-center gap-1.5">
            <PieChart className="w-4 h-4 text-purple-400" />
            Suc Manh 16 Nganh — Tang 3 Loc
          </h3>
          {isRealData
            ? <span className="flex items-center gap-1 text-[10px] text-emerald-400"><CheckCircle2 className="w-3 h-3" />RS thuc Yahoo Finance</span>
            : <span className="text-[10px] text-slate-500 italic">Dang tai du lieu thuc...</span>}
        </div>
        <div className="space-y-2.5">
          {enrichedSectors.map((sector, i) => {
            const isSelected = selectedSector === sector.name;
            const inTang3 = tang3Result.some((s) => s.sector === sector.name);
            return (
              <div key={i} onClick={() => setSelectedSector(isSelected ? null : sector.name)}
                style={isSelected ? { background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.3)" } : { background: "rgba(2,6,15,0.5)", border: "1px solid rgba(148,163,184,0.08)" }}
                className="rounded-xl p-3 cursor-pointer hover:brightness-110 transition">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black text-slate-200">{sector.name}</span>
                    {inTang3 && <span style={{ background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.3)" }} className="text-[9px] font-bold text-purple-400 px-1.5 py-0.5 rounded-full">T3</span>}
                    {sector.isReal && (
                      <span style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)" }} className="text-[9px] font-bold text-emerald-400 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                        {sector.rsAvg !== null && sector.rsAvg >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                        RS {sector.rsAvg}%
                      </span>
                    )}
                    {isRealData && !sector.isReal && <span className="text-[9px] text-slate-600 italic flex items-center gap-0.5"><Minus className="w-2.5 h-2.5" /> chua du lieu</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400">{sector.flow}</span>
                    <span className="text-[10px] font-black font-mono" style={{ color: strengthColor(sector.strength) }}>{sector.strength}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-slate-800/60 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${sector.strength}%`, background: strengthColor(sector.strength) }} />
                </div>
                {isSelected && (
                  <div className="mt-3 pt-3 border-t border-slate-800/60">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Xuc Tac Chinh</p>
                        <p className="text-xs text-slate-200">{sector.catalyst}</p>
                      </div>
                      <span style={{ color: statusColor(sector.status), background: `${statusColor(sector.status)}18`, border: `1px solid ${statusColor(sector.status)}40` }} className="text-[9px] font-black px-2 py-1 rounded-lg shrink-0">{sector.status}</span>
                    </div>
                    {(() => {
                      const stocks = tang3Result.filter((s) => s.sector === sector.name);
                      if (stocks.length === 0) return null;
                      return (
                        <div className="mt-2.5">
                          <p className="text-[10px] text-slate-500 font-bold uppercase mb-1.5">Ma trong Tang 3 ({stocks.length} ma)</p>
                          <div className="flex flex-wrap gap-1.5">
                            {stocks.map((s, si) => (
                              <button key={si} onClick={(e) => { e.stopPropagation(); setSelectedStockId(s.ticker); setActiveTab("elite"); }}
                                style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }}
                                className="text-[10px] font-black text-amber-400 px-2 py-1 rounded-lg hover:brightness-110 transition">
                                {s.ticker} <span className="text-slate-500 font-normal ml-1">{s.tang3Score}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. TOP 20 CO PHIEU TONG HOP */}
      <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold uppercase text-slate-100 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Top 20 Co Phieu Tong Hop (Tang 3 + Du Lieu Thuc)
          </h3>
          <div className="flex items-center gap-2">
            {isRealData && <span className="flex items-center gap-1 text-[10px] text-emerald-400"><CheckCircle2 className="w-3 h-3" />RS + MA50 thuc</span>}
            <button onClick={() => setShowAll(!showAll)} style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }} className="text-[10px] font-bold text-amber-400 px-2 py-1 rounded-lg">
              {showAll ? "Rut gon" : "Xem ca 20"}
            </button>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mb-3">
          Diem tong hop = Tang3Score + RS thuc × 0.5 + Vol Spike bonus - MA50 penalty.
          {isRealData ? " Dang dung du lieu thuc." : " Dang tai du lieu thuc..."}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800/60 text-slate-400 text-[10px] uppercase">
                <th className="pb-2 w-6">#</th>
                <th className="pb-2">Ma</th>
                <th className="pb-2">Nganh</th>
                <th className="pb-2 text-right">Diem TH</th>
                <th className="pb-2 text-right">RS 3T</th>
                <th className="pb-2 text-center">MA50</th>
                <th className="pb-2 text-right">Vol</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/30">
              {(showAll ? top20Stocks : top20Stocks.slice(0, 10)).map((s, i) => (
                <tr key={i} onClick={() => { setSelectedStockId(s.ticker); setActiveTab("elite"); }} className="hover:bg-slate-800/20 transition cursor-pointer">
                  <td className="py-2 text-slate-600 font-mono text-[10px]">{i + 1}</td>
                  <td className="py-2 font-black text-amber-400">{s.ticker}</td>
                  <td className="py-2 text-slate-400 text-[10px]">{s.sector}</td>
                  <td className="py-2 text-right font-mono font-black text-slate-200">{s.compositeScore}</td>
                  <td className="py-2 text-right font-mono">
                    {s.rs !== null
                      ? <span className={s.rs >= 0 ? "text-emerald-400" : "text-red-400"}>{s.rs >= 0 ? "+" : ""}{s.rs}%</span>
                      : <span className="text-slate-600">-</span>}
                  </td>
                  <td className="py-2 text-center">
                    {s.ma50Status === "safe" && <span className="text-[9px] text-emerald-400 font-bold">safe</span>}
                    {s.ma50Status === "warning" && <span className="text-[9px] text-amber-400 font-bold">warn</span>}
                    {s.ma50Status === "broken" && <span className="text-[9px] text-red-400 font-bold">❌</span>}
                    {!s.ma50Status && <span className="text-slate-600 text-[9px]">-</span>}
                  </td>
                  <td className="py-2 text-right font-mono text-slate-300 text-[10px]">
                    {s.volSpike !== null ? `${s.volSpike}x` : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!showAll && top20Stocks.length > 10 && (
          <button onClick={() => setShowAll(true)} className="w-full mt-3 text-[10px] text-slate-500 hover:text-slate-300 transition">
            + {top20Stocks.length - 10} ma nua...
          </button>
        )}
      </div>

      {/* 3. BLACK SWAN THAC */}
      <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold uppercase text-slate-100 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-red-400" />
            Kich Ban Rui Ro Vi Mo (Black Swan Monitor)
          </h3>
          <div className="flex items-center gap-2">
            {blackSwanData?.isAiGenerated && (
              <span className="flex items-center gap-1 text-[10px] text-purple-400">
                <Bot className="w-3 h-3" /> AI phan tich ({blackSwanData.newsCount} tin)
              </span>
            )}
            {!blackSwanData?.isAiGenerated && !bsLoading && (
              <span className="text-[10px] text-slate-500 italic">Du lieu tham khao</span>
            )}
            <button onClick={() => bsRefresh()} className="text-slate-400 hover:text-slate-200 transition">
              <RefreshCw className={`w-3.5 h-3.5 ${bsLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
        {bsLoading && !blackSwanData && (
          <div className="flex items-center gap-2 text-xs text-slate-400 py-4">
            <RefreshCw className="w-4 h-4 animate-spin" /> AI dang phan tich tin tuc vi mo moi nhat...
          </div>
        )}
        <div className="space-y-3">
          {displayScenarios.map((swan, i) => {
            const severity = (swan as { severity?: string }).severity as keyof typeof SEVERITY_CONFIG | undefined;
            const cfg = severity ? SEVERITY_CONFIG[severity] : SEVERITY_CONFIG.medium;
            const sourceHeadlines = (swan as { sourceHeadlines?: string[] }).sourceHeadlines ?? [];
            return (
              <div key={i} style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }} className="rounded-xl p-4">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <p className="text-xs font-black text-red-300">{swan.event}</p>
                  {severity && (
                    <span style={{ color: cfg.color, background: `${cfg.color}18`, border: `1px solid ${cfg.color}40` }} className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0">
                      {cfg.label}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mb-1"><span className="text-slate-500 font-bold">Kenh: </span>{swan.channel}</p>
                <p className="text-[11px] text-amber-300">{swan.impact}</p>
                {sourceHeadlines.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-800/40">
                    <p className="text-[9px] text-slate-500 font-bold uppercase mb-1">Nguon tin:</p>
                    {sourceHeadlines.slice(0, 2).map((h, hi) => (
                      <p key={hi} className="text-[9px] text-slate-600 italic">• {h}</p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {blackSwanData?.generatedAt && (
          <p className="text-[9px] text-slate-600 mt-3">
            Cap nhat: {new Date(blackSwanData.generatedAt).toLocaleString("vi-VN")}
          </p>
        )}
      </div>

      {/* 4. PHAN PHOI DONG TIEN */}
      <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold uppercase text-slate-100 flex items-center gap-1.5">
            <Sliders className="w-4 h-4 text-sky-400" />
            Phan Phoi Dong Tien Theo Nhom Nha Dau Tu
          </h3>
          {isRealData
            ? <span className="flex items-center gap-1 text-[10px] text-emerald-400"><CheckCircle2 className="w-3 h-3" />Uoc tinh tu RS thuc</span>
            : <span className="flex items-center gap-1 text-[10px] text-amber-400"><AlertCircle className="w-3 h-3" />Du lieu tham khao</span>}
        </div>
        {isRealData && (
          <p className="text-[10px] text-slate-500 mb-3 italic">
            Uoc tinh dua tren RS trung binh toan thi truong ({isPositiveForeignFlow ? "dong ngoai duong - co dong luc tang" : "dong ngoai am - can than trong"}).
            Day la uoc tinh, khong phai so lieu chinh thuc tu HoSE.
          </p>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "To Chuc Nuoc Ngoai", pct: foreignPct, color: "#34d399", sectors: enrichedSectors.filter((s) => s.flow === "Foreigner").map((s) => s.name) },
            { label: "To Chuc Trong Nuoc", pct: institutionalPct, color: "#60a5fa", sectors: enrichedSectors.filter((s) => s.flow === "Institutional").map((s) => s.name) },
            { label: "Ca Nhan Lon (HNW)", pct: hnwPct, color: "#f59e0b", sectors: enrichedSectors.filter((s) => s.flow === "High-Net-Worth").map((s) => s.name) },
            { label: "Ca Nhan Nho Le", pct: retailPct, color: "#a78bfa", sectors: enrichedSectors.filter((s) => s.flow === "Retail").map((s) => s.name) },
          ].map((group, i) => (
            <div key={i} style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-3">
              <p className="text-[10px] font-bold text-slate-400 mb-2">{group.label}</p>
              <p className="text-xl font-black font-mono mb-2" style={{ color: group.color }}>{group.pct}%</p>
              <div className="h-1.5 bg-slate-800/60 rounded-full mb-2">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${group.pct}%`, background: group.color }} />
              </div>
              <div className="flex flex-wrap gap-1">
                {group.sectors.slice(0, 3).map((s, si) => (
                  <span key={si} className="text-[8px] text-slate-500 bg-slate-800/40 px-1 py-0.5 rounded">{s}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}