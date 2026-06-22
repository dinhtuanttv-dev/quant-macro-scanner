"use client";

import { Activity, Zap } from "lucide-react";
import type { Tang4Stock } from "@/lib/quant-funnel";

interface RrgSector {
  name: string;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  rs: number;
  momentum: number;
  quadrant: string;
  color: string;
}

interface TaTabProps {
  taMode: string;
  setTaMode: (mode: string) => void;
  rrgSectors: RrgSector[];
  selectedRrgSector: string;
  setSelectedRrgSector: (name: string) => void;
  quantRadarTab: string;
  setQuantRadarTab: (tab: string) => void;
  tang4Result: Tang4Stock[];
  setSelectedStockId: (ticker: string) => void;
  setActiveTab: (tab: string) => void;
}

export default function TaTab({
  taMode, setTaMode, rrgSectors, selectedRrgSector, setSelectedRrgSector,
  quantRadarTab, setQuantRadarTab, tang4Result, setSelectedStockId, setActiveTab,
}: TaTabProps) {
  const selectedRrgSectorDetails = rrgSectors.find((s) => s.name === selectedRrgSector) || rrgSectors[0];

  const goldenFilterData = tang4Result
    .filter((s) => s.taData)
    .slice(0, 6)
    .map((s) => ({
      ticker: s.ticker,
      rsRating: Math.round(s.tang4Score),
      vsIndex: s.taData?.leader ? "Manh hon ro ret" : "On dinh tich luy",
      status: s.taData?.pattern ?? "-",
    }));
  const bearTrapData = tang4Result.filter((s) => s.taData && s.taData.foreignNet < 0).slice(0, 4);
  const foreignAccumData = tang4Result
    .filter((s) => s.taData && s.taData.foreignNet > 0)
    .sort((a, b) => (b.taData?.foreignNet ?? 0) - (a.taData?.foreignNet ?? 0))
    .slice(0, 4);

  return (
    <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-6 shadow-xl space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/60 pb-4">
        <div>
          <h3 className="text-sm font-bold uppercase text-slate-100 flex items-center gap-1.5"><Activity className="w-4 h-4 text-emerald-400" />Truc Quan Hoa Do Thi & Phan Tich Da Chieu</h3>
          <p className="text-xs text-slate-400 mt-1">Do thi nen ky thuat truyen thong hoac Ban do luan chuyen dong tien RRG.</p>
        </div>
        <div style={{ background: "rgba(2,6,15,0.7)", border: "1px solid rgba(148,163,184,0.1)" }} className="flex flex-wrap gap-1 p-1 rounded-xl">
          {["VCP", "Wyckoff", "Elliott", "VSA", "RRG"].map((mode) => (
            <button key={mode} onClick={() => setTaMode(mode)} style={taMode === mode ? { background: "linear-gradient(135deg, #fbbf24, #f59e0b)" } : {}} className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition ${taMode === mode ? "text-slate-950" : "text-slate-400 hover:text-slate-200"}`}>
              {mode === "RRG" ? "Ban Do RRG" : `${mode} Mode`}
            </button>
          ))}
        </div>
      </div>

      {taMode === "RRG" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="lg:col-span-2 rounded-2xl p-6 relative flex flex-col items-center">
            <div className="absolute top-3 left-3 text-[10px] font-mono text-slate-500">RRG Benchmark: <b className="text-amber-500">VN-Index</b></div>
            <div className="w-full flex justify-between text-[11px] font-bold text-slate-400 px-2 mb-2"><span className="text-sky-400">IMPROVING</span><span className="text-emerald-400">LEADING</span></div>
            <div style={{ border: "1px solid rgba(148,163,184,0.12)" }} className="w-full max-w-[360px] h-[320px] relative rounded-2xl">
              <svg width="100%" height="100%" viewBox="0 0 320 320" className="overflow-visible">
                <line x1="160" y1="0" x2="160" y2="320" stroke="#1e293b" strokeWidth="1.5" strokeDasharray="3,3" />
                <line x1="0" y1="160" x2="320" y2="160" stroke="#1e293b" strokeWidth="1.5" strokeDasharray="3,3" />
                <circle cx="160" cy="160" r="140" fill="none" stroke="#172033" strokeWidth="1" />
                <circle cx="160" cy="160" r="80" fill="none" stroke="#172033" strokeWidth="1" />
                {rrgSectors.map((sector, sIdx) => {
                  const isSelected = selectedRrgSector === sector.name;
                  return (
                    <g key={sIdx} className="cursor-pointer" onClick={() => setSelectedRrgSector(sector.name)}>
                      <path d={`M ${sector.prevX} ${sector.prevY} Q ${(sector.prevX + sector.x) / 2 - 10} ${(sector.prevY + sector.y) / 2 - 10} ${sector.x} ${sector.y}`} fill="none" stroke={sector.color} strokeWidth={isSelected ? "2.5" : "1.2"} strokeDasharray={isSelected ? "none" : "2,2"} opacity={isSelected ? "1" : "0.5"} />
                      <circle cx={sector.x} cy={sector.y} r={isSelected ? "7" : "5"} fill={sector.color} stroke="#070b14" strokeWidth="1.5" />
                      <text x={sector.x + 8} y={sector.y + 4} fill={isSelected ? "#ffffff" : "#94a3b8"} fontSize={isSelected ? "11" : "9"} className="font-bold select-none">{sector.name}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <div className="w-full flex justify-between text-[11px] font-bold text-slate-400 px-2 mt-2"><span className="text-red-400">LAGGING</span><span className="text-amber-500">WEAKENING</span></div>
          </div>

          <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3 border-b border-slate-800/60 pb-3">
                <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: selectedRrgSectorDetails.color }}></span>
                <h4 className="font-black text-sm text-slate-100 uppercase">Nganh: {selectedRrgSectorDetails.name}</h4>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div style={{ background: "rgba(14,22,38,0.7)", border: "1px solid rgba(148,163,184,0.1)" }} className="p-3 rounded-lg"><span className="text-slate-500 block uppercase text-[9px] font-bold">RS</span><span className="text-slate-200 font-mono font-bold block mt-0.5">{selectedRrgSectorDetails.rs}</span></div>
                <div style={{ background: "rgba(14,22,38,0.7)", border: "1px solid rgba(148,163,184,0.1)" }} className="p-3 rounded-lg"><span className="text-slate-500 block uppercase text-[9px] font-bold">Momentum</span><span className="text-slate-200 font-mono font-bold block mt-0.5">{selectedRrgSectorDetails.momentum}</span></div>
              </div>
              <div style={{ background: "rgba(14,22,38,0.7)", border: "1px solid rgba(148,163,184,0.1)" }} className="p-3.5 rounded-xl text-xs mt-3">
                <span className="text-slate-400 block font-bold mb-1">Goc phan tu chu ky:</span>
                <span className={`font-black uppercase text-xs ${selectedRrgSectorDetails.quadrant === "Leading" ? "text-emerald-400" : selectedRrgSectorDetails.quadrant === "Improving" ? "text-sky-400" : selectedRrgSectorDetails.quadrant === "Lagging" ? "text-red-400" : "text-amber-500"}`}>{selectedRrgSectorDetails.quadrant}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute top-3 right-3 text-[10px] font-mono text-slate-500 space-y-0.5 text-right">
            <div>RSI (14): <b className="text-emerald-400">62.4</b></div>
            <div>MACD: <b className="text-emerald-400">12.5</b></div>
            <div>MFI: <b className="text-emerald-400">65.8</b></div>
          </div>
          <div className="h-64 flex items-end justify-between gap-1 border-b border-slate-800/60 pb-3">
            {[{ h: 30, o: 35, c: 45, l: 28 }, { h: 48, o: 45, c: 50, l: 40 }, { h: 52, o: 50, c: 42, l: 40 }, { h: 46, o: 42, c: 38, l: 35 }, { h: 42, o: 38, c: 44, l: 34 }, { h: 58, o: 44, c: 54, l: 42 }, { h: 62, o: 54, c: 60, l: 52 }, { h: 68, o: 60, c: 56, l: 55 }, { h: 64, o: 56, c: 62, l: 54 }, { h: 74, o: 62, c: 72, l: 60 }].map((bar, i) => {
              const isGreen = bar.c >= bar.o;
              return (
                <div key={i} className="flex-1 flex flex-col items-center h-full justify-end relative">
                  <div className="w-[1.5px] bg-slate-600" style={{ height: `${bar.h - bar.l}%`, transform: `translateY(${100 - bar.h}%)` }}></div>
                  <div className={`w-full rounded-sm relative ${isGreen ? "bg-emerald-500/80" : "bg-red-500/80"}`} style={{ height: `${Math.max(4, Math.abs(bar.c - bar.o))}%`, bottom: `${Math.min(bar.o, bar.c)}%` }}></div>
                </div>
              );
            })}
          </div>
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
            {taMode === "VCP" && (<div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }} className="text-amber-400 px-4 py-2 rounded-xl text-xs font-bold text-center">MO HINH VCP DANG TAO VONG THU HEP THU 3</div>)}
            {taMode === "Wyckoff" && (<div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)" }} className="text-emerald-400 px-4 py-2 rounded-xl text-xs font-bold text-center">WYCKOFF PHASE C: HOAN THANH SPRING & SOS</div>)}
            {taMode === "Elliott" && (<div style={{ background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.3)" }} className="text-sky-400 px-4 py-2 rounded-xl text-xs font-bold text-center">CHAN SONG 3 TANG TRUONG CHU DAO</div>)}
            {taMode === "VSA" && (<div style={{ background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.3)" }} className="text-purple-300 px-4 py-2 rounded-xl text-xs font-bold text-center">VSA: DANG QUET DIEM NO-SUPPLY BAR</div>)}
          </div>
        </div>
      )}

      <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 mt-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800/60 pb-4 mb-4">
          <h4 className="text-sm font-black text-slate-100 uppercase tracking-wide flex items-center gap-2"><Zap className="text-amber-500 w-5 h-5" />Terminal Tin Hieu Dinh Luong</h4>
          <div style={{ background: "rgba(14,22,38,0.7)", border: "1px solid rgba(148,163,184,0.1)" }} className="flex p-1 rounded-xl text-[10px] font-bold">
            {[{ id: "golden", label: "Golden Filter" }, { id: "beartrap", label: "Bay Giam Gia" }, { id: "foreign", label: "Quy Ngoai Gom" }].map((t) => (
              <button key={t.id} onClick={() => setQuantRadarTab(t.id)} style={quantRadarTab === t.id ? { background: "linear-gradient(135deg, #fbbf24, #f59e0b)" } : {}} className={`px-3 py-1.5 rounded-lg transition ${quantRadarTab === t.id ? "text-slate-950 font-black" : "text-slate-400 hover:text-slate-200"}`}>{t.label}</button>
            ))}
          </div>
        </div>

        {quantRadarTab === "golden" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead><tr className="border-b border-slate-800/60 text-slate-400 text-[10px] uppercase"><th className="pb-2">Ma</th><th className="pb-2">Diem T4</th><th className="pb-2">Vi The</th><th className="pb-2 text-right">Mau Hinh</th></tr></thead>
              <tbody className="divide-y divide-slate-800/30">
                {goldenFilterData.map((item, idx) => (
                  <tr key={idx} onClick={() => { setSelectedStockId(item.ticker); setActiveTab("elite"); }} className="hover:bg-slate-900/30 transition cursor-pointer">
                    <td className="py-2.5 font-black text-amber-400">{item.ticker}</td><td className="py-2.5 font-bold font-mono">{item.rsRating}</td><td className="py-2.5 text-slate-300">{item.vsIndex}</td><td className="py-2.5 text-right font-bold text-slate-100">{item.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {quantRadarTab === "beartrap" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead><tr className="border-b border-slate-800/60 text-slate-400 text-[10px] uppercase"><th className="pb-2">Ma</th><th className="pb-2">Dong Tien Ngoai</th><th className="pb-2 text-right">Mau Hinh</th></tr></thead>
              <tbody className="divide-y divide-slate-800/30">
                {bearTrapData.map((item, idx) => (
                  <tr key={idx} onClick={() => { setSelectedStockId(item.ticker); setActiveTab("elite"); }} className="hover:bg-slate-900/30 transition cursor-pointer">
                    <td className="py-2.5 font-black text-amber-400">{item.ticker}</td><td className="py-2.5 text-red-400 font-mono">{item.taData?.foreignNet} ty</td><td className="py-2.5 text-right text-slate-300">{item.taData?.pattern}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {quantRadarTab === "foreign" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead><tr className="border-b border-slate-800/60 text-slate-400 text-[10px] uppercase"><th className="pb-2">Ma</th><th className="pb-2">Gia Tri Gom Rong</th><th className="pb-2 text-right">Mau Hinh</th></tr></thead>
              <tbody className="divide-y divide-slate-800/30">
                {foreignAccumData.map((item, idx) => (
                  <tr key={idx} onClick={() => { setSelectedStockId(item.ticker); setActiveTab("elite"); }} className="hover:bg-slate-900/30 transition cursor-pointer">
                    <td className="py-2.5 font-black text-amber-400">{item.ticker}</td><td className="py-2.5 text-emerald-400 font-mono font-black">+{item.taData?.foreignNet} ty</td><td className="py-2.5 text-right text-slate-300">{item.taData?.pattern}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}