"use client";

import { useState } from "react";
import { ShieldAlert, Sliders, PieChart } from "lucide-react";
import type { Tang3Stock } from "@/lib/quant-funnel";

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

export default function SectorsTab({
  sectorsData, blackSwans, tang3Result, setSelectedStockId, setActiveTab,
}: SectorsTabProps) {
  const [fearGreedValue] = useState(68);

  const renderFearGreedGauge = (value: number) => {
    const cx = 110, cy = 100, r = 80;
    const startAngle = Math.PI;
    const valueAngle = startAngle - (value / 100) * Math.PI;
    const polarToCartesian = (angle: number) => ({ x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle) });
    const segments = [
      { from: 0, to: 33, color: "#ef4444" },
      { from: 33, to: 66, color: "#fbbf24" },
      { from: 66, to: 100, color: "#34d399" },
    ];
    const arcPath = (fromPct: number, toPct: number) => {
      const a1 = startAngle - (fromPct / 100) * Math.PI;
      const a2 = startAngle - (toPct / 100) * Math.PI;
      const p1 = polarToCartesian(a1);
      const p2 = polarToCartesian(a2);
      return `M ${p1.x} ${p1.y} A ${r} ${r} 0 0 1 ${p2.x} ${p2.y}`;
    };
    const needle = polarToCartesian(valueAngle);
    return (
      <svg viewBox="0 0 220 130" className="w-full h-32">
        {segments.map((seg, i) => (
          <path key={i} d={arcPath(seg.from, seg.to)} fill="none" stroke={seg.color} strokeWidth="14" strokeLinecap="round" opacity="0.85" />
        ))}
        <line x1={cx} y1={cy} x2={needle.x} y2={needle.y} stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="6" fill="#f59e0b" stroke="#0a0f1e" strokeWidth="2" />
        <text x={cx} y={cy + 28} textAnchor="middle" fill="#fbbf24" fontSize="22" fontWeight="800">{value}</text>
        <text x={cx} y={cy + 44} textAnchor="middle" fill="#64748b" fontSize="9" fontWeight="700">/ 100</text>
      </svg>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <h3 className="text-xs font-bold uppercase text-slate-400 mb-2 tracking-wider">Chi So So Hai & Tham Lam</h3>
          {renderFearGreedGauge(fearGreedValue)}
          <div className="flex justify-between text-[9px] text-slate-500 mt-1 font-bold px-1"><span>SO HAI</span><span>TRUNG LAP</span><span>THAM LAM</span></div>
        </div>
        <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 shadow-xl md:col-span-2">
          <h3 className="text-xs font-bold uppercase text-slate-300 mb-3 flex items-center gap-1.5"><PieChart className="w-4 h-4 text-emerald-400" />Su Dong Pha Luong Von</h3>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="p-3 rounded-xl"><span className="text-[10px] text-amber-500 font-bold block mb-1">Large-Cap</span><p className="text-slate-300 font-medium leading-relaxed">Trai phieu My dai han & Big-Tech dan dat.</p></div>
            <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="p-3 rounded-xl"><span className="text-[10px] text-amber-500 font-bold block mb-1">Mid-Cap</span><p className="text-slate-300 font-medium leading-relaxed">Ban le tieu dung va vat lieu ban dan ha nguon.</p></div>
            <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="p-3 rounded-xl"><span className="text-[10px] text-amber-500 font-bold block mb-1">Small-Cap</span><p className="text-slate-300 font-medium leading-relaxed">Rut re phong thu, lai suat duy tri cao.</p></div>
          </div>
        </div>
      </div>

      <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 shadow-xl">
        <h3 className="text-xs font-bold uppercase text-slate-300 mb-4 flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-red-400" />Ma Tran Thien Nga Den</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead><tr className="border-b border-slate-800/60 text-slate-400"><th className="pb-3 font-semibold w-1/4">Su Kien</th><th className="pb-3 font-semibold w-1/2">Kenh Truyen Dan</th><th className="pb-3 font-semibold w-1/4">Tac Dong</th></tr></thead>
            <tbody className="divide-y divide-slate-800/40">
              {blackSwans.map((sw, idx) => (<tr key={idx} className="hover:bg-slate-800/20 transition"><td className="py-3 pr-4 font-bold text-slate-200">{sw.event}</td><td className="py-3 pr-4 text-slate-300 font-medium leading-relaxed">{sw.channel}</td><td className="py-3 text-amber-400 font-bold">{sw.impact}</td></tr>))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 shadow-xl">
        <h3 className="text-xs font-bold uppercase text-slate-300 mb-4 flex items-center gap-2"><Sliders className="w-4 h-4 text-amber-500" />Ban Do Xuc Tac Chinh Sach Toan Nganh</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead><tr className="border-b border-slate-800/60 text-slate-400"><th className="pb-3 font-semibold">Ten Nganh</th><th className="pb-3 font-semibold">Xuc Tac</th><th className="pb-3 font-semibold">Trang Thai</th><th className="pb-3 font-semibold">Dong Tien</th><th className="pb-3 font-semibold text-right">Suc Manh</th></tr></thead>
            <tbody className="divide-y divide-slate-800/30">
              {sectorsData.map((sec, idx) => (
                <tr key={idx} className="hover:bg-slate-800/20 transition">
                  <td className="py-3 font-bold text-slate-200">{sec.name}</td>
                  <td className="py-3 text-slate-300 max-w-sm">{sec.catalyst}</td>
                  <td className="py-3"><span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${sec.status === "Strong Positive" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" : sec.status === "Positive" ? "bg-emerald-500/10 text-emerald-400/90" : "bg-slate-800 text-slate-400"}`}>{sec.status}</span></td>
                  <td className="py-3 text-slate-400 font-medium">{sec.flow}</td>
                  <td className="py-3 text-right"><div className="flex items-center justify-end gap-2"><span className="font-bold text-amber-400 font-mono">{sec.strength}%</span><div style={{ background: "rgba(2,6,15,0.8)", border: "1px solid rgba(148,163,184,0.1)" }} className="w-16 h-2 rounded-full overflow-hidden"><div style={{ background: "linear-gradient(90deg, #fbbf24, #f59e0b)", width: `${sec.strength}%` }} className="h-full"></div></div></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 shadow-xl">
        <h4 className="text-xs font-black text-slate-100 uppercase tracking-wider mb-3">Tang 3: Suc Manh Xung Luc Nganh - Top 20</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead><tr className="border-b border-slate-800/60 text-slate-400 text-[10px] uppercase"><th className="pb-2">Ma</th><th className="pb-2">Nganh</th><th className="pb-2 text-right">Suc Manh Nganh</th><th className="pb-2 text-right">Diem Tang 3</th></tr></thead>
            <tbody className="divide-y divide-slate-800/30">
              {tang3Result.slice(0, 8).map((s, i) => (
                <tr key={i} onClick={() => { setSelectedStockId(s.ticker); setActiveTab("elite"); }} className="hover:bg-slate-800/20 transition cursor-pointer">
                  <td className="py-2 font-black text-amber-400">{s.ticker}</td>
                  <td className="py-2 text-slate-300">{s.sector}</td>
                  <td className="py-2 text-right text-purple-300 font-mono">{s.sectorStrength}%</td>
                  <td className="py-2 text-right text-amber-400 font-bold font-mono">{s.tang3Score.toFixed(1)}</td>
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