"use client";

import { useState, useMemo } from "react";
import {
  Coins, Calendar, ShieldAlert, TrendingUp, TrendingDown,
  Search, RefreshCw, CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  DIVIDEND_STOCKS, getTradePhase, calcDividendScore, calcCatalystScore,
  detectRiskFlags, calcDCF, filterAndSortStocks, getDaysUntil, fmtVND, fmtPct,
  DEFAULT_FILTER, type DividendFilter, type DividendStock,
} from "@/lib/quant-cotuc";
import { useMarketData } from "@/lib/market-data/useMarketData";

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? "bg-emerald-950 text-emerald-300 border-emerald-700"
    : score >= 60 ? "bg-amber-950 text-amber-300 border-amber-700"
    : "bg-slate-900 text-slate-400 border-slate-700";
  return <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border ${color}`}>{score}/100</span>;
}

function PhaseBadge({ s }: { s: DividendStock }) {
  const phase = getTradePhase(s);
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-lg border flex items-center gap-0.5 w-fit ${phase.color}`}>
      {phase.icon} {phase.label}
    </span>
  );
}

function RsBadge({ rs }: { rs: number | null | undefined }) {
  if (rs === null || rs === undefined) return <span className="text-slate-600 text-[9px]">-</span>;
  return (
    <span className={`text-[9px] font-bold flex items-center gap-0.5 ${rs >= 0 ? "text-emerald-400" : "text-red-400"}`}>
      {rs >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {rs >= 0 ? "+" : ""}{rs}%
    </span>
  );
}

function DaysChip({ dateStr, label }: { dateStr: string; label: string }) {
  const d = getDaysUntil(dateStr);
  if (d === null) return null;
  const past = d < 0;
  const urgent = d >= 0 && d <= 7;
  return (
    <div className={`text-center px-2 py-1 rounded-lg border text-[10px] ${
      past ? "border-slate-700 text-slate-600"
      : urgent ? "border-rose-700 bg-rose-950 text-rose-400"
      : "border-slate-700 text-slate-400"}`}>
      <span className="block font-bold">{label}</span>
      <span className={`font-black ${urgent ? "animate-pulse" : ""}`}>
        {past ? "Đã qua" : d === 0 ? "Hôm nay!" : `${d}n`}
      </span>
    </div>
  );
}

function StockModal({ s, onClose, realRs }: { s: DividendStock; onClose: () => void; realRs: number | null | undefined }) {
  const [modalTab, setModalTab] = useState<"overview" | "dcf" | "flags">("overview");
  const phase = getTradePhase(s);
  const score = calcDividendScore(s);
  const catalyst = calcCatalystScore(s);
  const flags = detectRiskFlags(s);
  const dcfBear = calcDCF(s, "bear");
  const dcfBase = calcDCF(s, "base");
  const dcfBull = calcDCF(s, "bull");

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-4 overflow-y-auto">
      <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.15)" }} className="w-full max-w-2xl rounded-2xl shadow-2xl my-4">
        <div className="flex items-center justify-between p-5 border-b border-slate-800/60">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-black text-amber-400">{s.ticker}</span>
            <div>
              <p className="text-xs font-bold text-slate-200">{s.name}</p>
              <p className="text-[10px] text-slate-500">{s.sector} · {s.marketCap}-Cap</p>
            </div>
            <ScoreBadge score={score} />
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 text-xs px-3 py-1.5 rounded-lg border border-slate-700">✕ Đóng</button>
        </div>

        <div className="flex gap-2 p-4 border-b border-slate-800/60 flex-wrap">
          <DaysChip dateStr={s.agmDate} label="ĐHCĐ" />
          <DaysChip dateStr={s.exDividendDate} label="GDKHQ" />
          <DaysChip dateStr={s.paymentDate} label="Nhận tiền" />
          <div className="flex-1 min-w-[140px] bg-slate-900/60 rounded-lg p-2 border border-slate-700">
            <p className="text-[9px] text-slate-500 font-bold uppercase">Cổ tức / CP</p>
            <p className="text-sm font-black text-emerald-400">{fmtVND(s.dividendAmount)}</p>
            <p className="text-[9px] text-slate-400">Yield: {fmtPct(s.dividendYield)}</p>
          </div>
          <div style={{ border: "1px solid rgba(148,163,184,0.1)" }} className={`flex-1 min-w-[140px] rounded-lg p-2 ${phase.color}`}>
            <p className="text-[9px] font-bold uppercase opacity-70">Vị thế</p>
            <p className="text-xs font-black">{phase.icon} {phase.action}</p>
            <p className="text-[9px] opacity-70">{phase.safety}</p>
          </div>
        </div>

        <div className="flex border-b border-slate-800/60 px-4">
          {(["overview", "dcf", "flags"] as const).map((t) => (
            <button key={t} onClick={() => setModalTab(t)}
              className={`px-4 py-2.5 text-[10px] font-bold border-b-2 transition-all ${modalTab === t ? "border-amber-500 text-amber-400" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
              {t === "overview" ? "📊 Tổng Quan" : t === "dcf" ? "💵 DCF 3 Kịch Bản" : "⚠️ Rủi Ro"}
            </button>
          ))}
        </div>

        <div className="p-5 max-h-[55vh] overflow-y-auto space-y-3">
          {modalTab === "overview" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["P/E", s.pe + "x"], ["ROE", fmtPct(s.roe)],
                  ["Tăng trưởng EPS", (s.growth > 0 ? "+" : "") + s.growth + "%"], ["F-Score", s.fscore + "/9"],
                  ["Payout Ratio", fmtPct(s.payoutRatio)], ["Debt/Equity", s.debtEquity + "x"],
                  ["RSI", String(s.rsi)], ["Catalyst", catalyst + "/10"],
                  ["RS 3T (THỰC Yahoo)", realRs !== null && realRs !== undefined ? (realRs >= 0 ? "+" : "") + realRs + "%" : "Chưa có"],
                  ["Institutional", s.institutionalHold + "%"],
                ].map(([label, val]) => (
                  <div key={label} style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-lg p-2.5">
                    <p className="text-[9px] text-slate-500 font-bold uppercase">{label}</p>
                    <p className="text-xs font-black text-slate-200 mt-0.5">{val}</p>
                  </div>
                ))}
              </div>
              <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-lg p-3">
                <p className="text-[9px] text-slate-500 font-bold uppercase mb-1">📝 Nghị Quyết ĐHCĐ</p>
                <p className="text-xs text-slate-300">{s.agmAgenda}</p>
              </div>
              <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-lg p-3">
                <p className="text-[9px] text-slate-500 font-bold uppercase mb-1">👤 Cổ đông nội bộ</p>
                <p className="text-xs text-slate-300">{s.insiderStatus}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)" }} className="rounded-lg p-2.5">
                  <p className="text-[9px] text-emerald-400 font-bold uppercase mb-1">✅ Ưu điểm</p>
                  {s.pros.map((p, i) => <p key={i} className="text-[10px] text-slate-300">• {p}</p>)}
                </div>
                <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }} className="rounded-lg p-2.5">
                  <p className="text-[9px] text-red-400 font-bold uppercase mb-1">❌ Nhược điểm</p>
                  {s.cons.map((c, i) => <p key={i} className="text-[10px] text-slate-300">• {c}</p>)}
                </div>
              </div>
            </>
          )}

          {modalTab === "dcf" && (
            <div className="space-y-3">
              <p className="text-[10px] text-slate-500 italic">DCF 10 năm, chiết khấu 10%/năm, tăng trưởng cuối 3%. Chỉ mang tính tham khảo.</p>
              {([["bear", "🐻 Xấu", dcfBear], ["base", "⚖️ Cơ Sở", dcfBase], ["bull", "🐂 Tốt", dcfBull]] as const).map(([sc, label, val]) => {
                const pct = ((val - s.price) / s.price * 100);
                const gRate = s.growth * (sc === "bear" ? 0.4 : sc === "bull" ? 1.6 : 1);
                return (
                  <div key={sc} style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black text-slate-200">{label}</p>
                      <p className="text-[9px] text-slate-500 mt-0.5">g = {gRate.toFixed(1)}%/năm</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-black ${sc === "bull" ? "text-emerald-400" : sc === "base" ? "text-amber-400" : "text-red-400"}`}>{fmtVND(val)}</p>
                      <p className={`text-[10px] font-bold ${pct > 0 ? "text-emerald-400" : "text-red-400"}`}>{pct > 0 ? "+" : ""}{pct.toFixed(0)}% vs thị giá</p>
                    </div>
                  </div>
                );
              })}
              <div style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.2)" }} className="rounded-xl p-3 text-center">
                <p className="text-[9px] text-sky-400 font-bold uppercase">Vùng DCF hợp lý</p>
                <p className="text-sm font-black text-sky-300">{fmtVND(dcfBear)} — {fmtVND(dcfBull)}</p>
              </div>
            </div>
          )}

          {modalTab === "flags" && (
            <div className="space-y-3">
              {flags.length === 0 ? (
                <div style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)" }} className="rounded-xl p-4 flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" /><span className="text-xs font-bold">Sạch rủi ro tài chính!</span>
                </div>
              ) : flags.map((f, i) => (
                <div key={i} style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.25)" }} className="rounded-xl p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-300">{f}</p>
                </div>
              ))}
              <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-3">
                <p className="text-[9px] text-slate-500 font-bold uppercase mb-1">🎯 Chiến lược</p>
                <p className="text-xs text-slate-300">{phase.desc}</p>
              </div>
              <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-3">
                <p className="text-[9px] text-slate-500 font-bold uppercase mb-1">🌐 {s.globalIndicator}</p>
                <p className="text-xs text-slate-300">{s.globalTrend}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}export default function CotucTab() {
  const [subTab, setSubTab] = useState<"screener" | "calendar">("screener");
  const [filter, setFilter] = useState<DividendFilter>(DEFAULT_FILTER);
  const [sortField, setSortField] = useState<string>("dividendYield");
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<DividendStock | null>(null);
  const [showFilter, setShowFilter] = useState(true);

  const { marketData } = useMarketData(60);
  const realRsMap = useMemo(() => {
    const map: Record<string, number | null> = {};
    marketData?.tickers.forEach((t) => { map[t.ticker] = t.relativeStrength3m; });
    return map;
  }, [marketData]);

  const filtered = useMemo(() =>
    filterAndSortStocks(DIVIDEND_STOCKS, filter, sortField as keyof DividendStock | "score" | "catalyst", sortAsc, realRsMap),
    [filter, sortField, sortAsc, realRsMap]
  );

  const stats = useMemo(() => {
    const yieldAvg = DIVIDEND_STOCKS.reduce((s, x) => s + x.dividendYield, 0) / DIVIDEND_STOCKS.length;
    const highYield = DIVIDEND_STOCKS.filter((x) => x.dividendYield >= 5).length;
    const upcoming = DIVIDEND_STOCKS.filter((x) => { const d = getDaysUntil(x.exDividendDate); return d !== null && d >= 0 && d <= 30; }).length;
    const upcomingAGM = DIVIDEND_STOCKS.filter((x) => { const d = getDaysUntil(x.agmDate); return d !== null && d >= 0 && d <= 14; });
    return { yieldAvg, highYield, upcoming, upcomingAGM };
  }, []);

  const calendarList = useMemo(() =>
    [...DIVIDEND_STOCKS].sort((a, b) => {
      const da = getDaysUntil(a.exDividendDate) ?? 9999;
      const db = getDaysUntil(b.exDividendDate) ?? 9999;
      return da - db;
    }), []
  );

  const handleSort = (field: string) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  const SortIcon = ({ field }: { field: string }) =>
    sortField === field
      ? (sortAsc ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />)
      : null;

  return (
    <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 shadow-xl space-y-4">

      {/* HEADER */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-800/60">
        <h3 className="text-sm font-bold uppercase text-slate-100 flex items-center gap-1.5">
          <Coins className="w-4 h-4 text-amber-400" />
          Phân Tích Cổ Tức & ĐHCĐ
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          {marketData
            ? <span className="flex items-center gap-1 text-[10px] text-emerald-400"><CheckCircle2 className="w-3 h-3" />RS 3T: Yahoo Finance THỰC</span>
            : <span className="flex items-center gap-1 text-[10px] text-slate-400"><RefreshCw className="w-3 h-3 animate-spin" />Đang tải RS thực...</span>}
          <span className="text-[10px] text-amber-400 italic">Yield/BCTC: Data mẫu</span>
        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Yield TB Universe", value: fmtPct(stats.yieldAvg), color: "text-emerald-400", sub: `${DIVIDEND_STOCKS.length} mã theo dõi` },
          { label: "Yield > 5%", value: String(stats.highYield), color: "text-amber-400", sub: "mã trong universe" },
          { label: "Sắp GDKHQ (30n)", value: String(stats.upcoming), color: "text-sky-400", sub: "mã trong 30 ngày tới" },
          { label: "Sắp ĐHCĐ (14n)", value: String(stats.upcomingAGM.length), color: stats.upcomingAGM.length > 0 ? "text-purple-400" : "text-slate-400", sub: stats.upcomingAGM.map((s) => s.ticker).join(", ") || "Không có" },
        ].map((item) => (
          <div key={item.label} style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-3">
            <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">{item.label}</p>
            <p className={`text-xl font-black ${item.color}`}>{item.value}</p>
            <p className="text-[9px] text-slate-500 mt-0.5">{item.sub}</p>
          </div>
        ))}
      </div>

      {/* SUB-TAB */}
      <div style={{ background: "rgba(2,6,15,0.7)", border: "1px solid rgba(148,163,184,0.1)" }} className="flex p-1 rounded-xl">
        {[
          { id: "screener" as const, label: "📋 Bộ Lọc Cổ Phiếu", count: filtered.length },
          { id: "calendar" as const, label: "📅 Lịch GDKHQ & ĐHCĐ", count: calendarList.length },
        ].map((t) => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            style={subTab === t.id ? { background: "linear-gradient(135deg, #fbbf24, #f59e0b)" } : {}}
            className={`flex-1 py-2 px-3 rounded-lg text-[10px] font-black transition-all ${subTab === t.id ? "text-slate-950" : "text-slate-400 hover:text-slate-200"}`}>
            {t.label} <span className={`ml-1 ${subTab === t.id ? "text-slate-800" : "text-amber-400"}`}>({t.count})</span>
          </button>
        ))}
      </div>

      {/* SCREENER */}
      {subTab === "screener" && (
        <div className="space-y-3">
          <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-3">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input value={filter.searchQ} onChange={(e) => setFilter({ ...filter, searchQ: e.target.value })}
                  placeholder="Tìm mã hoặc tên..."
                  style={{ background: "rgba(2,6,15,0.7)", border: "1px solid rgba(148,163,184,0.15)" }}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-500" />
              </div>
              <button onClick={() => setShowFilter(!showFilter)} className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1">
                {showFilter ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} Bộ lọc
              </button>
            </div>

            {showFilter && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: `Yield ≥ ${fmtPct(filter.minYield)}`, key: "minYield", min: 0, max: 15, step: 0.5, val: filter.minYield },
                    { label: `ROE ≥ ${fmtPct(filter.minRoe)}`, key: "minRoe", min: 0, max: 30, step: 1, val: filter.minRoe },
                    { label: `P/E ≤ ${filter.maxPe}x`, key: "maxPe", min: 5, max: 25, step: 0.5, val: filter.maxPe },
                    { label: `F-Score ≥ ${filter.minFscore}/9`, key: "minFscore", min: 0, max: 9, step: 1, val: filter.minFscore },
                  ].map((f) => (
                    <div key={f.key}>
                      <label className="text-[9px] text-slate-400 font-bold block mb-1">{f.label}</label>
                      <input type="range" min={f.min} max={f.max} step={f.step} value={f.val}
                        onChange={(e) => setFilter({ ...filter, [f.key]: parseFloat(e.target.value) })}
                        className="w-full h-1.5 accent-amber-500" />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 flex-wrap items-center">
                  {[
                    { label: "👑 Siêu Cổ Tức", f: { minYield: 7, minRoe: 12, maxPe: 15, maxDebt: 0.5, minFscore: 6, hideRiskFlags: true } },
                    { label: "💎 Kim Cương", f: { minYield: 3, minRoe: 20, maxPe: 20, maxDebt: 0.7, minFscore: 7 } },
                    { label: "📅 Sắp GDKHQ", f: { upcomingGDKHQ: true } },
                    { label: "📋 Sắp ĐHCĐ", f: { upcomingAGM: true } },
                    { label: "🔄 Xóa lọc", f: DEFAULT_FILTER },
                  ].map((preset) => (
                    <button key={preset.label} onClick={() => setFilter({ ...DEFAULT_FILTER, ...preset.f })}
                      style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}
                      className="text-[10px] font-bold text-amber-400 px-2 py-1 rounded-lg hover:brightness-110 transition">
                      {preset.label}
                    </button>
                  ))}
                  <label className="flex items-center gap-1 text-[10px] text-slate-400 cursor-pointer ml-auto">
                    <input type="checkbox" checked={filter.hideRiskFlags}
                      onChange={(e) => setFilter({ ...filter, hideRiskFlags: e.target.checked })}
                      className="accent-amber-500" />
                    🛡️ Ẩn Red Flag
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800/60 text-slate-400 text-[10px] uppercase">
                  <th className="pb-2 cursor-pointer hover:text-slate-200" onClick={() => handleSort("ticker")}>Mã <SortIcon field="ticker" /></th>
                  <th className="pb-2 cursor-pointer hover:text-amber-400" onClick={() => handleSort("dividendYield")}>Yield <SortIcon field="dividendYield" /></th>
                  <th className="pb-2 text-right cursor-pointer hover:text-slate-200" onClick={() => handleSort("score")}>Score <SortIcon field="score" /></th>
                  <th className="pb-2 text-center">RS 3T</th>
                  <th className="pb-2 text-center cursor-pointer hover:text-slate-200" onClick={() => handleSort("rsi")}>RSI <SortIcon field="rsi" /></th>
                  <th className="pb-2">Vị Thế</th>
                  <th className="pb-2">GDKHQ</th>
                  <th className="pb-2">ĐHCĐ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/30">
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="py-8 text-center text-slate-500 text-xs italic">Không có mã nào phù hợp. Hãy nới lỏng bộ lọc.</td></tr>
                )}
                {filtered.map((s) => {
                  const gdkhqDays = getDaysUntil(s.exDividendDate);
                  const agmDays = getDaysUntil(s.agmDate);
                  const flags = detectRiskFlags(s);
                  const rs = realRsMap[s.ticker];
                  return (
                    <tr key={s.ticker} onClick={() => setSelected(s)} className="hover:bg-slate-800/30 transition cursor-pointer">
                      <td className="py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-black text-amber-400">{s.ticker}</span>
                          {flags.length > 2 && <AlertCircle className="w-3 h-3 text-rose-400" />}
                        </div>
                        <span className="text-[9px] text-slate-500">{s.sector}</span>
                      </td>
                      <td className="py-3">
                        <span className="text-emerald-400 font-black">{fmtPct(s.dividendYield)}</span>
                        <span className="text-[9px] text-slate-500 block">{fmtVND(s.dividendAmount)}/cp</span>
                      </td>
                      <td className="py-3 text-right"><ScoreBadge score={calcDividendScore(s)} /></td>
                      <td className="py-3 text-center"><RsBadge rs={rs} /></td>
                      <td className="py-3 text-center">
                        <span className={`text-[10px] font-bold ${s.rsi >= 60 ? "text-rose-400" : s.rsi <= 42 ? "text-emerald-400" : "text-amber-400"}`}>{s.rsi}</span>
                      </td>
                      <td className="py-3"><PhaseBadge s={s} /></td>
                      <td className="py-3">
                        <span className={`text-[10px] font-mono ${gdkhqDays !== null && gdkhqDays >= 0 && gdkhqDays <= 7 ? "text-rose-400 font-black animate-pulse" : "text-slate-400"}`}>{s.exDividendDate}</span>
                        {gdkhqDays !== null && gdkhqDays >= 0 && <span className="text-[9px] text-slate-500 block">còn {gdkhqDays}n</span>}
                      </td>
                      <td className="py-3">
                        <span className={`text-[10px] font-mono ${agmDays !== null && agmDays >= 0 && agmDays <= 7 ? "text-purple-400 font-black animate-pulse" : "text-slate-500"}`}>{s.agmDate}</span>
                        {agmDays !== null && agmDays >= 0 && agmDays <= 7 && <span className="text-[9px] text-purple-400 block">còn {agmDays}n!</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[9px] text-slate-600">Lọc: {filtered.length}/{DIVIDEND_STOCKS.length} mã · Click hàng để xem chi tiết + DCF + Rủi ro</p>
        </div>
      )}{/* CALENDAR */}
      {subTab === "calendar" && (
        <div className="space-y-2">
          <p className="text-[10px] text-slate-500 italic mb-3">
            Phải mua cổ phiếu <b className="text-amber-400">trước ngày GDKHQ</b> để nhận cổ tức. Sắp xếp theo ngày GDKHQ gần nhất.
          </p>
          {calendarList.map((s) => {
            const gdkhqDays = getDaysUntil(s.exDividendDate);
            const agmDays = getDaysUntil(s.agmDate);
            const past = gdkhqDays !== null && gdkhqDays < 0;
            const urgent = gdkhqDays !== null && gdkhqDays >= 0 && gdkhqDays <= 7;
            const phase = getTradePhase(s);
            const rs = realRsMap[s.ticker];
            return (
              <div key={s.ticker} onClick={() => setSelected(s)}
                style={urgent
                  ? { background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }
                  : past
                  ? { background: "rgba(2,6,15,0.3)", border: "1px solid rgba(148,163,184,0.05)", opacity: 0.6 }
                  : { background: "rgba(2,6,15,0.5)", border: "1px solid rgba(148,163,184,0.08)" }}
                className="rounded-xl p-3.5 flex items-center gap-3 cursor-pointer hover:brightness-110 transition">
                <div className={`w-14 text-center shrink-0 p-2 rounded-xl border ${urgent ? "border-rose-700 bg-rose-950" : "border-slate-700 bg-slate-900/60"}`}>
                  {past
                    ? <span className="text-xs text-slate-500 font-bold">Đã qua</span>
                    : <span className={`text-lg font-black block ${urgent ? "text-rose-400 animate-pulse" : "text-amber-400"}`}>{gdkhqDays}</span>}
                  {!past && <span className="text-[9px] text-slate-500">ngày</span>}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-black text-amber-400">{s.ticker}</span>
                    <span className="text-[10px] text-slate-400 truncate">{s.name}</span>
                    <PhaseBadge s={s} />
                    {urgent && (
                      <span style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)" }} className="text-[9px] text-red-400 px-1.5 py-0.5 rounded font-black animate-pulse">
                        🔥 Sắp chốt!
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 text-[10px] text-slate-400">
                    <span>📅 GDKHQ: <b className="text-amber-400">{s.exDividendDate}</b></span>
                    <span>💵 <b className="text-emerald-400">{fmtVND(s.dividendAmount)}/cp ({fmtPct(s.dividendYield)})</b></span>
                    <span>🏦 Nhận: <b className="text-sky-400">{s.paymentDate}</b></span>
                    {agmDays !== null && agmDays >= 0 && agmDays <= 30 && (
                      <span className="text-purple-400 font-bold">📋 ĐHCĐ: {s.agmDate} (còn {agmDays}n)</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <ScoreBadge score={calcDividendScore(s)} />
                  <RsBadge rs={rs} />
                  <span className="text-[9px] text-slate-500">{phase.action}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL */}
      {selected && (
        <StockModal s={selected} onClose={() => setSelected(null)} realRs={realRsMap[selected.ticker]} />
      )}
    </div>
  );
}