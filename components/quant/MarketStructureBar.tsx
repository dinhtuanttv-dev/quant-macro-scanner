"use client";

import { useState } from "react";
import { TrendingUp, Droplets, AlertTriangle, Globe2, ChevronDown, ChevronUp } from "lucide-react";
import { marketStructureDataV2, marketRegimeLabels } from "@/lib/quant-data-v2";

export default function MarketStructureBar() {
  const [expanded, setExpanded] = useState(false);
  const d = marketStructureDataV2;
  const regimeInfo = marketRegimeLabels[d.regime];

  return (
    <div
      style={{ background: "linear-gradient(135deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.12)" }}
      className="rounded-2xl shadow-xl mb-6 overflow-hidden"
    >
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-800/20 transition"
      >
        <div className="flex items-center gap-3">
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ background: regimeInfo.color, boxShadow: `0 0 12px ${regimeInfo.color}` }}
          />
          <div className="text-left">
            <div className="text-sm font-black text-slate-100">
              Cau Truc Thi Truong:{" "}
              <span style={{ color: regimeInfo.color }}>{regimeInfo.label}</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">{regimeInfo.implication}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-slate-400 shrink-0">
          <span className="text-[10px]">Chi tiet 4 tru cot</span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 border-t border-slate-800/60 pt-4">
          <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-xl p-3.5">
            <div className="flex items-center gap-1.5 mb-2.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] font-black uppercase text-slate-300">Xu Huong & Pha</span>
            </div>
            <div className="space-y-1.5 text-[11px]">
              <Row label="VN-Index vs MA50" value={`+${d.vnIndexVsMA50Pct}%`} positive={d.vnIndexVsMA50Pct >= 0} />
              <Row label="VN-Index vs MA200" value={`+${d.vnIndexVsMA200Pct}%`} positive={d.vnIndexVsMA200Pct >= 0} />
              <Row label="Do rong (% tren MA50)" value={`${d.breadthPctAboveMA50}%`} positive={d.breadthPctAboveMA50 >= 50} />
              <Row label="KL so 20 phien TB" value={`${d.volumeVs20dAvgPct}%`} positive={d.volumeVs20dAvgPct >= 100} />
            </div>
          </div>

          <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-xl p-3.5">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Droplets className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-[10px] font-black uppercase text-slate-300">Cau Truc Dong Tien</span>
            </div>
            <div className="space-y-1.5 text-[11px]">
              <Row label="GTGD toan TT" value={`${d.totalMarketValueBn.toLocaleString()} ty`} positive={d.liquidityTrendPct >= 0} />
              <Row label="Khoi ngoai" value={`${d.foreignNetMarketBn >= 0 ? "+" : ""}${d.foreignNetMarketBn} ty`} positive={d.foreignNetMarketBn >= 0} />
              <Row label="Tu doanh" value={`${d.proprietaryNetMarketBn >= 0 ? "+" : ""}${d.proprietaryNetMarketBn} ty`} positive={d.proprietaryNetMarketBn >= 0} />
              <Row label="Du no margin" value={d.marginBalanceTrend === "rising" ? "Tang" : d.marginBalanceTrend === "falling" ? "Giam" : "On dinh"} positive={d.marginBalanceTrend !== "rising"} />
            </div>
          </div>

          <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-xl p-3.5">
            <div className="flex items-center gap-1.5 mb-2.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] font-black uppercase text-slate-300">Rui Ro & Tam Ly</span>
            </div>
            <div className="space-y-1.5 text-[11px]">
              <Row label="Bien dong thuc te 20d" value={`${d.historicalVolatility20d}%`} positive={d.historicalVolatility20d < 20} />
              <Row label="Dinh moi / Day moi 52w" value={`${d.newHighs52w} / ${d.newLows52w}`} positive={d.newHighs52w > d.newLows52w} />
              <Row label="Phan tan nganh" value={`${d.sectorDispersionScore}/100`} positive={d.sectorDispersionScore < 50} />
            </div>
          </div>

          <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-xl p-3.5">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Globe2 className="w-3.5 h-3.5 text-purple-300" />
              <span className="text-[10px] font-black uppercase text-slate-300">Boi Canh Vi Mo</span>
            </div>
            <div className="space-y-1 text-[10px]">
              {d.macroTailwinds.map((t, i) => (
                <div key={`tw-${i}`} className="text-emerald-400 flex items-start gap-1">
                  <span>+</span><span>{t}</span>
                </div>
              ))}
              {d.macroHeadwinds.map((h, i) => (
                <div key={`hw-${i}`} className="text-red-400 flex items-start gap-1">
                  <span>-</span><span>{h}</span>
                </div>
              ))}
              <div className="text-slate-400 mt-1.5 pt-1.5 border-t border-slate-800/50">
                Basis VN30F: <span className="font-mono text-slate-200">{d.vn30FuturesBasisPct >= 0 ? "+" : ""}{d.vn30FuturesBasisPct}%</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={`font-mono font-bold ${positive ? "text-emerald-400" : "text-red-400"}`}>{value}</span>
    </div>
  );
}