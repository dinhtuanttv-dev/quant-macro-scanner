"use client";

import { Globe, CheckCircle2, Coins, TrendingUp, TrendingDown, XCircle } from "lucide-react";
import type { Tang2Stock } from "@/lib/quant-funnel";

interface GlobalIndexSector {
  index: string;
  country: string;
  sectors: string[];
  vnSectorsFavored: string[];
  rationale: string;
}

interface CommodityImpact {
  id: string;
  name: string;
  category: string;
  price: string;
  change: string;
  trend: "Up" | "Down" | "Neutral";
  sectorFavored: string;
  transmission: string;
}

interface CommodityTabProps {
  globalIndicesSectors: GlobalIndexSector[];
  commoditiesImpact: CommodityImpact[];
  tang2Result: Tang2Stock[];
  setSelectedStockId: (ticker: string) => void;
  setActiveTab: (tab: string) => void;
}

export default function CommodityTab({
  globalIndicesSectors, commoditiesImpact, tang2Result, setSelectedStockId, setActiveTab,
}: CommodityTabProps) {
  return (
    <div className="space-y-8">
      <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-6 shadow-xl">
        <div className="border-b border-slate-800/60 pb-4 mb-5">
          <h3 className="text-sm font-bold uppercase text-slate-100 flex items-center gap-2">
            <Globe className="w-5 h-5 text-amber-500" />
            10 Chi So Lon Nhat & Nganh Dan Song The Gioi
          </h3>
          <p className="text-xs text-slate-400 mt-1">Phan tich su dong pha dong chay nguon von toan cau den cac nhom nganh Viet Nam thu huong.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {globalIndicesSectors.map((item, idx) => (
            <div key={idx} style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-xl p-5 hover:border-slate-600/40 transition">
              <div className="flex items-center justify-between mb-3">
                <span style={{ border: "1px solid rgba(148,163,184,0.15)" }} className="text-xs font-bold text-slate-100 bg-slate-900/60 px-2.5 py-1 rounded">{item.index}</span>
                <span style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)" }} className="text-[10px] uppercase font-extrabold text-amber-500 px-2.5 py-0.5 rounded-full">{item.country}</span>
              </div>
              <span className="text-[10px] text-slate-500 uppercase font-black tracking-wider block">Nganh tang manh nhat toan cau:</span>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {item.sectors.map((sec, sIdx) => (<span key={sIdx} style={{ border: "1px solid rgba(148,163,184,0.12)" }} className="bg-slate-900/60 text-slate-300 text-[10px] font-bold px-2 py-1 rounded">{sec}</span>))}
              </div>
              <p className="text-xs text-slate-400 mt-3.5 leading-relaxed"><b className="text-slate-300">Co so ly thuyet:</b> {item.rationale}</p>
              <div className="mt-4 pt-3 border-t border-slate-800/50">
                <span className="text-[10px] text-emerald-400/80 font-bold block uppercase tracking-wider flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Nganh VN dong pha huong loi:</span>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {item.vnSectorsFavored.map((sec, si) => (<span key={si} style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)" }} className="text-emerald-400 text-[10px] font-bold px-2 py-1 rounded">{sec}</span>))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-6 shadow-xl">
        <div className="border-b border-slate-800/60 pb-4 mb-5">
          <h3 className="text-sm font-bold uppercase text-slate-100 flex items-center gap-2"><Coins className="w-5 h-5 text-amber-500" />Ma Tran Tac Dong Gia Hang Hoa The Gioi</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {commoditiesImpact.map((comm) => (
            <div key={comm.id} style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-xl p-5 hover:border-slate-600/40 transition">
              <div className="flex items-center justify-between mb-3">
                <span style={{ border: "1px solid rgba(148,163,184,0.12)" }} className="text-[10px] bg-slate-900/60 text-slate-400 px-2.5 py-0.5 rounded font-semibold">{comm.category}</span>
                <span className={`text-xs font-black px-2 py-0.5 rounded-full flex items-center gap-1 ${comm.trend === "Up" ? "bg-emerald-500/10 text-emerald-400" : comm.trend === "Neutral" ? "bg-slate-800 text-slate-400" : "bg-red-500/10 text-red-400"}`}>
                  {comm.trend === "Up" && <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />}{comm.trend === "Down" && <TrendingDown className="w-3.5 h-3.5 text-red-400" />}{comm.trend} Trend
                </span>
              </div>
              <h4 className="text-base font-bold text-slate-100">{comm.name}</h4>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-xl font-black text-slate-200 font-mono">{comm.price}</span>
                <span className={`text-xs font-bold font-mono ${comm.trend === "Up" ? "text-emerald-400" : "text-slate-400"}`}>{comm.change}</span>
              </div>
              <p className="text-xs text-slate-400 mt-3 leading-relaxed"><b className="text-slate-300">Co che truyen dan:</b> {comm.transmission}</p>
              <div className="mt-4 pt-3 border-t border-slate-800/50">
                <span className="text-[10px] text-slate-500 font-bold block uppercase">Nganh VN thu huong:</span>
                <span style={{ background: comm.trend === "Up" ? "linear-gradient(135deg, #fbbf24, #f59e0b)" : "rgba(148,163,184,0.1)" }} className={`inline-block mt-2 text-xs px-2.5 py-1 rounded-lg font-black ${comm.trend === "Up" ? "text-slate-950" : "text-slate-400"}`}>{comm.sectorFavored}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 shadow-xl">
        <h4 className="text-xs font-black text-slate-100 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Globe className="w-4 h-4 text-sky-400" />Tang 2: Ket Noi The Gioi - Top 20 Dong Thuan</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead><tr className="border-b border-slate-800/60 text-slate-400 text-[10px] uppercase"><th className="pb-2">Ma</th><th className="pb-2">Nganh</th><th className="pb-2 text-center">Dong Pha Chi So TG</th><th className="pb-2 text-center">Dong Pha Hang Hoa</th><th className="pb-2 text-right">Diem Tang 2</th></tr></thead>
            <tbody className="divide-y divide-slate-800/30">
              {tang2Result.slice(0, 8).map((s, i) => (
                <tr key={i} onClick={() => { setSelectedStockId(s.ticker); setActiveTab("elite"); }} className="hover:bg-slate-800/20 transition cursor-pointer">
                  <td className="py-2 font-black text-amber-400">{s.ticker}</td>
                  <td className="py-2 text-slate-300">{s.sector}</td>
                  <td className="py-2 text-center">{s.globalSync ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline" /> : <XCircle className="w-3.5 h-3.5 text-slate-600 inline" />}</td>
                  <td className="py-2 text-center">{s.commoditySync ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline" /> : <XCircle className="w-3.5 h-3.5 text-slate-600 inline" />}</td>
                  <td className="py-2 text-right text-amber-400 font-bold font-mono">{s.tang2Score.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-500 mt-2">Hien thi 8/20 ma. Xem day du tai tab Elite 10.</p>
      </div>
    </div>
  );
}