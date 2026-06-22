"use client";

import {
  Award, Sparkles, ShieldAlert, Clock, ShieldCheck, AlertTriangle, XCircle, Calculator,
  Eye, CheckCircle2, HelpCircle, Plus,
} from "lucide-react";
import { useState } from "react";
import type { Tang1Stock, Tang2Stock, Tang3Stock, Tang4Stock, ConfluenceStock } from "@/lib/quant-funnel";
import { watchlistSampleV2, checkSectorConcentration } from "@/lib/quant-data-v2";

interface SelectedStockView {
  ticker: string;
  sector: string;
  score: number;
  matchCount: number;
  entry: string;
  target: string;
  stoploss: string;
  weight: string;
  radar: { macro: number; flow: number; tech: number; sentiment: number };
  reason: string;
  pattern: string;
  rr: string;
}

interface RebalanceLogEntry {
  time: string;
  removed: string;
  added: string;
  reason: string;
}

interface KellyCalculation {
  rrRatio: string;
  rawKelly: string;
  allocatedPercentage: string;
  allocatedCapital: number;
  shares: number;
  maxRiskCapital: number;
}

interface EliteTabProps {
  eliteTop10: ConfluenceStock[];
  reserve11: ConfluenceStock | null;
  selectedStockId: string;
  setSelectedStockId: (ticker: string) => void;
  selectedStock: SelectedStockView | null;
  commodityFavoredTickers: Set<string>;
  globalFavoredTickers: Set<string>;
  daysInEliteMap: Record<string, number>;
  rebalanceLog: RebalanceLogEntry[];
  totalCapital: number;
  setTotalCapital: (v: number) => void;
  expectedWinRate: number;
  setExpectedWinRate: (v: number) => void;
  kellyFraction: number;
  setKellyFraction: (v: number) => void;
  kellyCalculation: KellyCalculation;
  tang1Result: Tang1Stock[];
  tang2Result: Tang2Stock[];
  tang3Result: Tang3Stock[];
  tang4Result: Tang4Stock[];
}

function FunnelBadge({
  tang1Result, tang2Result, tang3Result, tang4Result, ticker,
}: { tang1Result: Tang1Stock[]; tang2Result: Tang2Stock[]; tang3Result: Tang3Stock[]; tang4Result: Tang4Stock[]; ticker: string }) {
  const inT1 = tang1Result.some((s) => s.ticker === ticker);
  const inT2 = tang2Result.some((s) => s.ticker === ticker);
  const inT3 = tang3Result.some((s) => s.ticker === ticker);
  const inT4 = tang4Result.some((s) => s.ticker === ticker);
  const labels = [
    { active: inT1, label: "T1" },
    { active: inT2, label: "T2" },
    { active: inT3, label: "T3" },
    { active: inT4, label: "T4" },
  ];
  return (
    <div className="flex gap-1">
      {labels.map((l, i) => (
        <span
          key={i}
          style={l.active ? { background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.4)", color: "#34d399" } : { background: "rgba(100,116,139,0.08)", border: "1px solid rgba(100,116,139,0.2)", color: "#64748b" }}
          className="text-[8px] font-black px-1.5 py-0.5 rounded"
        >
          {l.label}
        </span>
      ))}
    </div>
  );
}

function renderSpiderChart(radar: { macro: number; flow: number; tech: number; sentiment: number }) {
  const axes = [
    { key: "macro" as const, label: "Vi mo" },
    { key: "flow" as const, label: "Dong tien" },
    { key: "tech" as const, label: "Ky thuat" },
    { key: "sentiment" as const, label: "Tam ly" },
  ];
  const cx = 100, cy = 100, maxR = 68;
  const angleStep = (Math.PI * 2) / axes.length;
  const points = axes.map((axis, i) => {
    const angle = -Math.PI / 2 + i * angleStep;
    const value = radar[axis.key] / 100;
    const r = maxR * value;
    return {
      x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle),
      labelX: cx + (maxR + 26) * Math.cos(angle), labelY: cy + (maxR + 26) * Math.sin(angle),
      value: radar[axis.key], label: axis.label,
    };
  });
  const gridLevels = [0.25, 0.5, 0.75, 1];
  const polygonPoints = points.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <svg viewBox="0 0 200 200" className="w-full h-52">
      <defs><radialGradient id="radarFill" cx="50%" cy="50%" r="65%"><stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" /><stop offset="100%" stopColor="#f59e0b" stopOpacity="0.08" /></radialGradient></defs>
      {gridLevels.map((lvl, i) => {
        const gridPts = axes.map((axis, ai) => {
          const angle = -Math.PI / 2 + ai * angleStep;
          const r = maxR * lvl;
          return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
        }).join(" ");
        return <polygon key={i} points={gridPts} fill="none" stroke="#1e293b" strokeWidth="1" />;
      })}
      {axes.map((axis, i) => {
        const angle = -Math.PI / 2 + i * angleStep;
        return <line key={i} x1={cx} y1={cy} x2={cx + maxR * Math.cos(angle)} y2={cy + maxR * Math.sin(angle)} stroke="#1e293b" strokeWidth="1" />;
      })}
      <polygon points={polygonPoints} fill="url(#radarFill)" stroke="#f59e0b" strokeWidth="2" />
      {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#fbbf24" stroke="#0a0f1e" strokeWidth="1.5" />)}
      {points.map((p, i) => <text key={i} x={p.labelX} y={p.labelY} fill="#94a3b8" fontSize="9.5" fontWeight="700" textAnchor="middle" dominantBaseline="middle">{p.label}</text>)}
      {points.map((p, i) => <text key={`v-${i}`} x={p.labelX} y={p.labelY + 12} fill="#f59e0b" fontSize="9" fontWeight="800" textAnchor="middle" dominantBaseline="middle">{p.value}</text>)}
    </svg>
  );
}

function WatchlistStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; icon: typeof CheckCircle2; color: string; bg: string }> = {
    qualified: { label: "Du dieu kien Elite", icon: CheckCircle2, color: "#34d399", bg: "rgba(16,185,129,0.12)" },
    partial: { label: "Dat mot phan", icon: Eye, color: "#fbbf24", bg: "rgba(245,158,11,0.12)" },
    rejected_t1: { label: "Bi loai Tang 1", icon: XCircle, color: "#f87171", bg: "rgba(239,68,68,0.12)" },
    insufficient_data: { label: "Thieu du lieu", icon: HelpCircle, color: "#94a3b8", bg: "rgba(148,163,184,0.1)" },
  };
  const c = config[status] ?? config.insufficient_data;
  const Icon = c.icon;
  return (
    <span style={{ background: c.bg, color: c.color, border: `1px solid ${c.color}40` }} className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full">
      <Icon className="w-3 h-3" />
      {c.label}
    </span>
  );
}

export default function EliteTab({
  eliteTop10, reserve11, selectedStockId, setSelectedStockId, selectedStock,
  commodityFavoredTickers, globalFavoredTickers, daysInEliteMap, rebalanceLog,
  totalCapital, setTotalCapital, expectedWinRate, setExpectedWinRate,
  kellyFraction, setKellyFraction, kellyCalculation,
  tang1Result, tang2Result, tang3Result, tang4Result,
}: EliteTabProps) {
  const [watchlistInput, setWatchlistInput] = useState("");

  const concentration = checkSectorConcentration(
    eliteTop10.map((s) => ({ sector: s.sector })),
    3
  );
  const overConcentrated = concentration.filter((c) => c.isOverConcentrated);return (
    <div className="space-y-6">
      {rebalanceLog.length > 0 && (
        <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)" }} className="rounded-2xl p-4 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-300">
            <b className="text-red-400">Dynamic Rebalancing kich hoat:</b> ma <b className="text-red-400">{rebalanceLog[0].removed}</b> vi pham ho tro MA50 da bi tu dong loai bo khoi Elite 10. Ma du phong <b className="text-emerald-400">{rebalanceLog[0].added}</b> duoc day len thay the ngay lap tuc ({rebalanceLog[0].time}).
          </div>
        </div>
      )}

      {overConcentrated.length > 0 && (
        <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.25)" }} className="rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-300">
            <b className="text-amber-400">Canh bao tap trung nganh:</b>{" "}
            {overConcentrated.map((c, i) => (
              <span key={c.sector}>
                {i > 0 && ", "}
                <b className="text-amber-300">{c.sector}</b> chiem {c.count}/10 ma trong Elite
              </span>
            ))}
            . Khuyen nghi can nhac da dang hoa de giam rui ro tap trung mot nganh duy nhat.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 shadow-xl lg:col-span-2">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
            <h3 className="text-sm font-bold uppercase text-slate-100 flex items-center gap-1.5"><Award className="w-4 h-4 text-amber-500" />Bang Xep Hang Tinh Hoa: The Elite 10</h3>
            <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }} className="text-[10px] text-amber-500 px-2 py-1 rounded-lg flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />Khop 4/4 tang = Confluence Bonus toi da
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800/60 text-slate-400">
                  <th className="pb-3 font-semibold">Ticker</th>
                  <th className="pb-3 font-semibold">Nganh</th>
                  <th className="pb-3 font-semibold">Bo Loc Khop Lenh</th>
                  <th className="pb-3 font-semibold text-center">Days in Elite</th>
                  <th className="pb-3 font-semibold text-center">MA50</th>
                  <th className="pb-3 font-semibold text-right font-mono">Diem Hop Luu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/30">
                {eliteTop10.map((stk, idx) => {
                  const ma50 = stk.taData?.ma50Status ?? "safe";
                  const sectorOver = overConcentrated.some((c) => c.sector === stk.sector);
                  return (
                    <tr key={idx} onClick={() => setSelectedStockId(stk.ticker)} style={selectedStockId === stk.ticker ? { background: "rgba(245,158,11,0.06)", borderLeft: "2px solid #f59e0b" } : {}} className="hover:bg-slate-800/30 transition cursor-pointer">
                      <td className="py-3 font-black text-sm pl-2">
                        <span className={stk.matchCount === 4 ? "text-amber-400" : "text-slate-300"}>{stk.ticker}</span>
                      </td>
                      <td className="py-3 text-slate-300 font-semibold">
                        {stk.sector}
                        {sectorOver && <AlertTriangle className="w-3 h-3 text-amber-400 inline ml-1.5" />}
                      </td>
                      <td className="py-3"><FunnelBadge tang1Result={tang1Result} tang2Result={tang2Result} tang3Result={tang3Result} tang4Result={tang4Result} ticker={stk.ticker} /></td>
                      <td className="py-3 text-center text-slate-300 font-mono">{daysInEliteMap[stk.ticker] ?? 1}</td>
                      <td className="py-3 text-center">
                        {ma50 === "safe" && <ShieldCheck className="w-4 h-4 text-emerald-400 inline" />}
                        {ma50 === "warning" && <AlertTriangle className="w-4 h-4 text-amber-400 inline" />}
                        {ma50 === "broken" && <XCircle className="w-4 h-4 text-red-400 inline" />}
                      </td>
                      <td className="py-3 text-right">
                        <span className={`bg-slate-950/60 border px-2 py-0.5 rounded-full font-bold ${stk.matchCount === 4 ? "text-emerald-400 border-emerald-500/30" : "text-amber-400 border-amber-500/20"}`}>
                          {stk.finalScore} {stk.confluenceBonus > 0 ? `+${stk.confluenceBonus}` : ""}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {reserve11 && (
            <div style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.2)" }} className="mt-4 p-3 rounded-xl text-xs text-sky-300 flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0" />
              <span>Ma du phong #11: <b className="text-sky-300">{reserve11.ticker}</b> ({reserve11.sector}) - diem {reserve11.finalScore}.</span>
            </div>
          )}
        </div>

        <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          {selectedStock && (
            <>
              <div>
                <h3 className="text-xs font-bold uppercase text-slate-400 mb-2 tracking-wider">Phan Tich Hop Luu Da Chieu</h3>
                <div className="flex items-center justify-between border-b border-slate-800/60 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-black text-amber-400">{selectedStock.ticker}</span>
                    {(commodityFavoredTickers.has(selectedStock.ticker) || globalFavoredTickers.has(selectedStock.ticker)) && (
                      <span style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)" }} className="text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full">Dong Pha The Gioi</span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">{selectedStock.sector}</span>
                </div>
                <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="p-4 rounded-xl">{renderSpiderChart(selectedStock.radar)}</div>
              </div>
              <div className="mt-5">
                <h4 className="text-xs font-bold text-slate-300 mb-1">Luan Diem Dau Tu Tu CIO:</h4>
                <p className="text-xs text-slate-400 leading-relaxed font-mono">{selectedStock.reason}</p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase text-amber-400 mb-3 flex items-center gap-1.5"><Calculator className="w-4 h-4" />Thong So Bo Quan Tri Von Kelly</h3>
            <p className="text-[11px] text-slate-400 leading-relaxed mb-4">Toi uu hoa quy mo di tien dua tren cong thuc Kelly nham khong che rui ro toi da.</p>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 block uppercase mb-1">Tong Von Hien Tai (VND)</label>
                <input type="number" value={totalCapital} onChange={(e) => setTotalCapital(Number(e.target.value))} style={{ background: "rgba(2,6,15,0.7)", border: "1px solid rgba(148,163,184,0.15)" }} className="w-full rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 block uppercase mb-1">Xac Suat Thang Du Kien (%)</label>
                <input type="range" min="30" max="90" value={expectedWinRate} onChange={(e) => setExpectedWinRate(Number(e.target.value))} className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500" />
                <div className="flex justify-between font-mono text-[10px] text-slate-400 mt-1"><span>30%</span><span className="text-amber-400 font-bold">{expectedWinRate}%</span><span>90%</span></div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 block uppercase mb-1">He So Quy Mo (Kelly Fraction)</label>
                <div className="grid grid-cols-3 gap-1">
                  {[{ label: "1/4 Kelly", val: 0.25 }, { label: "1/2 Kelly", val: 0.5 }, { label: "Full Kelly", val: 1.0 }].map((frac) => (
                    <button key={frac.label} onClick={() => setKellyFraction(frac.val)} style={kellyFraction === frac.val ? { background: "rgba(245,158,11,0.14)", border: "1px solid rgba(245,158,11,0.5)" } : { background: "rgba(2,6,15,0.7)", border: "1px solid rgba(148,163,184,0.15)" }} className={`py-1 text-[10px] font-bold rounded-lg transition ${kellyFraction === frac.val ? "text-amber-400" : "text-slate-400"}`}>{frac.label}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="lg:col-span-2 rounded-2xl p-5 shadow-xl grid grid-cols-1 md:grid-cols-3 gap-5">
          <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="p-4 rounded-xl flex flex-col justify-between">
            <div><span className="text-slate-500 text-[10px] uppercase font-bold block">Ty Le Di Tien Khuyen Dung</span><span className="text-2xl font-black text-amber-400 mt-2 block font-mono">{kellyCalculation.allocatedPercentage}%</span></div>
            <span className="text-[9px] text-slate-400 leading-normal block">Kelly toi da ly thuyet: <b className="text-slate-300 font-mono">{kellyCalculation.rawKelly}%</b> (R/R = {kellyCalculation.rrRatio}).</span>
          </div>
          <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="p-4 rounded-xl flex flex-col justify-between">
            <div><span className="text-slate-500 text-[10px] uppercase font-bold block">Ngan Sach Giai Ngan</span><span className="text-lg font-black text-emerald-400 mt-2 block font-mono">{kellyCalculation.allocatedCapital.toLocaleString()} VND</span></div>
            <span className="text-[10px] text-slate-200 block font-bold">Mua Gom: {kellyCalculation.shares.toLocaleString()} CP</span>
          </div>
          <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="p-4 rounded-xl flex flex-col justify-between">
            <div><span className="text-slate-500 text-[10px] uppercase font-bold block">Rui Ro Toi Da Tren Deal</span><span className="text-lg font-black text-red-400 mt-2 block font-mono">{kellyCalculation.maxRiskCapital.toLocaleString()} VND</span></div>
            <span className="text-[9px] text-slate-400 leading-normal block">Khi gia cham Stoploss: <b className="text-slate-200 font-mono">{selectedStock?.stoploss}d</b>.</span>
          </div>
        </div>
      </div>

      <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <h3 className="text-sm font-bold uppercase text-slate-100 flex items-center gap-1.5">
            <Eye className="w-4 h-4 text-sky-400" />
            Watchlist Theo Doi ({watchlistSampleV2.length}/20)
          </h3>
          <div className="flex items-center gap-2">
            <input
              value={watchlistInput}
              onChange={(e) => setWatchlistInput(e.target.value.toUpperCase())}
              placeholder="Nhap ma CP..."
              style={{ background: "rgba(2,6,15,0.7)", border: "1px solid rgba(148,163,184,0.15)" }}
              className="rounded-lg px-3 py-1.5 text-xs text-slate-200 w-32 focus:outline-none focus:border-sky-500"
            />
            <button
              style={{ background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.3)" }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold text-sky-400 hover:brightness-110 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Them
            </button>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 mb-4">
          Theo doi ma CP truoc khi vao Elite 10. He thong cho biet ma dung lai o tang nao trong 4 tang loc, tranh ngo nhan "AI bo qua co hoi".
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800/60 text-slate-400 text-[10px] uppercase">
                <th className="pb-2">Ma</th>
                <th className="pb-2">Ngay Them</th>
                <th className="pb-2">Trang Thai</th>
                <th className="pb-2">Dung Tai Tang</th>
                <th className="pb-2">Ly Do</th>
                <th className="pb-2 text-right">Diem (neu co)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/30">
              {watchlistSampleV2.map((entry, idx) => (
                <tr key={idx} className="hover:bg-slate-800/20 transition">
                  <td className="py-2.5 font-black text-amber-400">{entry.ticker}</td>
                  <td className="py-2.5 text-slate-400 font-mono">{entry.addedDate}</td>
                  <td className="py-2.5"><WatchlistStatusBadge status={entry.status} /></td>
                  <td className="py-2.5 text-slate-300 font-mono">
                    {entry.stoppedAtTang === null ? "Qua het 4 tang" : `Tang ${entry.stoppedAtTang}`}
                  </td>
                  <td className="py-2.5 text-slate-400 max-w-xs">{entry.reason}</td>
                  <td className="py-2.5 text-right font-mono text-slate-200">{entry.finalScore ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}