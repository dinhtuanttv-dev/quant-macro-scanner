"use client";

import {
  RefreshCw, BookOpen, CheckCircle2, AlertTriangle, Cpu, Zap, Activity, Coins,
} from "lucide-react";
import type { Tang1Stock } from "@/lib/quant-funnel";

interface MacroNewsItem {
  id: number;
  headline: string;
  impact: number;
  affectedSectors: string;
  relatedTicker: string;
  type: string;
}

interface ActionableSignal {
  ticker: string;
  action: string;
  confidence: string;
  zone: string;
  status: string;
}

interface ValuationRow {
  ticker: string;
  current: string;
  fairValue: string;
  mos: string;
  status: string;
}

interface ScannerTabProps {
  isScanning: boolean;
  scannerProgress: number;
  scanStep: string;
  aiReport: string;
  isAiLoading: boolean;
  aiError: string;
  actionableSignals: ActionableSignal[];
  liveMacroNewsSentiment: MacroNewsItem[];
  activeNewsId: number;
  setActiveNewsId: (id: number) => void;
  activeNewsDetails: MacroNewsItem;
  aiValuationMatrix: ValuationRow[];
  setSelectedStockId: (ticker: string) => void;
  setActiveTab: (tab: string) => void;
  tang1Result: Tang1Stock[];
}

export default function ScannerTab({
  isScanning, scannerProgress, scanStep, aiReport, isAiLoading, aiError,
  actionableSignals, liveMacroNewsSentiment, activeNewsId, setActiveNewsId, activeNewsDetails,
  aiValuationMatrix, setSelectedStockId, setActiveTab, tang1Result,
}: ScannerTabProps) {
  return (
    <div className="space-y-6">
      {isScanning && (
        <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(245,158,11,0.25)" }} className="rounded-2xl p-5">
          <div className="flex justify-between text-xs text-amber-400 font-bold mb-2">
            <span className="flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
              HE THONG DANG QUET PHEU LOC 4 TANG...
            </span>
            <span className="font-mono">{scannerProgress}%</span>
          </div>
          <div style={{ background: "rgba(2,6,15,0.8)", border: "1px solid rgba(148,163,184,0.1)" }} className="w-full h-2 rounded-full overflow-hidden">
            <div style={{ background: "linear-gradient(90deg, #fbbf24, #10b981)", width: `${scannerProgress}%` }} className="h-full transition-all duration-300"></div>
          </div>
          <p className="text-xs text-slate-400 mt-3 font-mono"><b className="text-amber-500">Log:</b> {scanStep}</p>
        </div>
      )}

      <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800/60 pb-4 mb-5 relative z-10">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-base text-slate-100">Bao Cao CIO Doc Quyen</h3>
          </div>
          <span style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.35)" }} className="text-[10px] uppercase font-bold text-emerald-400 px-3 py-1 rounded-full flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Phan tich hop le
          </span>
        </div>

        {isAiLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
            <span className="text-xs text-slate-400 font-semibold">Dang tong hop du lieu pheu loc 4 tang...</span>
          </div>
        ) : (
          <div className="text-slate-300 text-sm leading-relaxed space-y-4 relative z-10">
            {aiError && (
              <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }} className="mb-4 p-3 text-amber-300 text-xs rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <span>{aiError}</span>
              </div>
            )}
            {aiReport ? (
              <div style={{ background: "rgba(2,6,15,0.55)", border: "1px solid rgba(148,163,184,0.1)" }} className="whitespace-pre-line p-5 rounded-xl font-normal font-sans">{aiReport}</div>
            ) : (
              <div style={{ background: "rgba(2,6,15,0.55)", border: "1px solid rgba(148,163,184,0.1)" }} className="text-slate-500 text-xs italic p-5 rounded-xl">
                Nhan &quot;KICH HOAT SIEU CAU LENH&quot; de he thong chay pheu loc 4 tang va tao bao cao chien luoc CIO.
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 shadow-xl">
        <h4 className="text-xs font-black text-slate-100 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Cpu className="w-4 h-4 text-amber-500" />
          Tang 1: Sieu Quet AI - Top 20 theo FA & EPS Growth
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800/60 text-slate-400 text-[10px] uppercase">
                <th className="pb-2">Ma</th><th className="pb-2">Nganh</th><th className="pb-2 text-right">EPS Growth</th><th className="pb-2 text-right">FA Score</th><th className="pb-2 text-right">Diem Tang 1</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/30">
              {tang1Result.slice(0, 8).map((s, i) => (
                <tr key={i} onClick={() => { setSelectedStockId(s.ticker); setActiveTab("elite"); }} className="hover:bg-slate-800/20 transition cursor-pointer">
                  <td className="py-2 font-black text-amber-400">{s.ticker}</td>
                  <td className="py-2 text-slate-300">{s.sector}</td>
                  <td className="py-2 text-right text-emerald-400 font-mono">+{s.epsGrowth}%</td>
                  <td className="py-2 text-right text-slate-200 font-mono">{s.faScore}</td>
                  <td className="py-2 text-right text-amber-400 font-bold font-mono">{s.tang1Score.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-500 mt-2">Hien thi 8/20 ma. Xem day du tai tab Elite 10.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 border-b border-slate-800/60 pb-3 mb-4">
              <Zap className="text-amber-500 w-4 h-4" />
              <h4 className="text-xs font-black text-slate-100 uppercase tracking-wider">Chien Luoc Hanh Dong Tuc Thoi</h4>
            </div>
            <div className="space-y-3">
              {actionableSignals.map((sig, sIdx) => (
                <div key={sIdx} onClick={() => { setSelectedStockId(sig.ticker); setActiveTab("elite"); }} style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="p-3 rounded-xl hover:border-amber-500/50 transition cursor-pointer flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold text-sm text-slate-200">{sig.ticker}</span>
                    <span style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)" }} className="text-[10px] text-amber-400 px-2 py-0.5 rounded-full font-bold">Tin cay: {sig.confidence}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-400 font-bold">{sig.action}</span>
                    <span className="text-emerald-400 font-mono">{sig.zone}</span>
                  </div>
                  <div className="text-[9px] text-slate-500 flex items-center justify-between">
                    <span>Status: {sig.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 border-b border-slate-800/60 pb-3 mb-4">
              <Activity className="text-emerald-400 w-4 h-4" />
              <h4 className="text-xs font-black text-slate-100 uppercase tracking-wider">Tin Tuc Vi Mo 24h</h4>
            </div>
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {liveMacroNewsSentiment.map((news) => (
                <div key={news.id} onClick={() => setActiveNewsId(news.id)} style={activeNewsId === news.id ? { background: "rgba(2,6,15,0.85)", border: "1px solid rgba(245,158,11,0.5)" } : { background: "rgba(2,6,15,0.4)", border: "1px solid rgba(148,163,184,0.08)" }} className="p-2.5 rounded-lg text-xs cursor-pointer transition">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[9px] font-extrabold text-slate-400">{news.type}</span>
                    <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-full ${news.impact >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>{news.impact >= 0 ? `+${news.impact}` : news.impact} pts</span>
                  </div>
                  <p className="text-[11px] text-slate-200 line-clamp-1 leading-snug">{news.headline}</p>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: "rgba(2,6,15,0.7)", border: "1px solid rgba(148,163,184,0.1)" }} className="p-2.5 rounded-lg text-[11px] mt-3">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Danh Gia Tac Dong ({activeNewsDetails.relatedTicker}):</span>
            <p className="text-slate-300 font-mono leading-normal">Thu huong truc tiep cho nganh <b>{activeNewsDetails.affectedSectors}</b>.</p>
          </div>
        </div>

        <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 border-b border-slate-800/60 pb-3 mb-4">
              <Coins className="text-amber-500 w-4 h-4" />
              <h4 className="text-xs font-black text-slate-100 uppercase tracking-wider">Dinh Gia Hop Ly & Bien An Toan</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead><tr className="border-b border-slate-800/60 text-slate-400 font-bold"><th className="pb-1.5">Ma</th><th className="pb-1.5">Gia Hien Tai</th><th className="pb-1.5">Dinh Gia AI</th><th className="pb-1.5 text-right">Bien An Toan</th></tr></thead>
                <tbody className="divide-y divide-slate-800/40">
                  {aiValuationMatrix.slice(0, 5).map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-950/50 transition">
                      <td className="py-2 font-black text-amber-400">{row.ticker}</td>
                      <td className="py-2 text-slate-300 font-mono">{row.current}d</td>
                      <td className="py-2 text-slate-200 font-bold font-mono">{row.fairValue}d</td>
                      <td className={`py-2 text-right font-black font-mono ${parseFloat(row.mos) >= 15 ? "text-emerald-400" : "text-slate-300"}`}>{row.mos}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}