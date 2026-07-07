"use client";

import { Activity, Zap, RefreshCw, AlertCircle, CheckCircle2, TrendingUp, TrendingDown, Shield, Star, Bot } from "lucide-react";
import type { Tang4Stock } from "@/lib/quant-funnel";
import { useOhlcvData } from "@/lib/market-data/useOhlcvData";
import { useScoredStocks } from "@/lib/market-data/useScoredStocks";
import ChartDrawingPanel from "@/components/quant/ChartDrawingPanel";
import TaCommandCenterTab from "@/components/quant/ta-command-center/TaCommandCenterTab";

interface RrgSector {
  name: string; x: number; y: number; prevX: number; prevY: number;
  rs: number; momentum: number; quadrant: string; color: string;
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
  selectedStockId: string;
  setSelectedStockId: (ticker: string) => void;
  setActiveTab: (tab: string) => void;
}

// ============ CANDLESTICK CHART THUC (khong tuong tac) ============
function RealCandlestickChart({ ticker }: { ticker: string }) {
  const { bars, isLoading, error } = useOhlcvData(ticker, "3mo");

  if (isLoading) return (
    <div className="h-64 flex items-center justify-center gap-2 text-xs text-slate-400">
      <RefreshCw className="w-4 h-4 animate-spin" /> Dang tai du lieu nen thuc cho {ticker}...
    </div>
  );
  if (error || bars.length === 0) return (
    <div className="h-64 flex items-center justify-center gap-2 text-xs text-red-300">
      <AlertCircle className="w-4 h-4" /> Khong co du lieu nen thuc cho {ticker}.
    </div>
  );

  const maxPrice = Math.max(...bars.map((b) => b.high));
  const minPrice = Math.min(...bars.map((b) => b.low));
  const priceRange = maxPrice - minPrice || 1;
  const toPct = (price: number) => ((price - minPrice) / priceRange) * 100;
  const lastClose = bars[bars.length - 1].close;
  const firstClose = bars[0].close;
  const changePct = (((lastClose - firstClose) / firstClose) * 100).toFixed(1);

  return (
    <div className="relative">
      <div className="absolute top-0 right-0 text-[10px] font-mono text-slate-500 space-y-0.5 text-right z-10">
        <div>Ma: <b className="text-amber-400">{ticker}</b></div>
        <div>3T: <b className={Number(changePct) >= 0 ? "text-emerald-400" : "text-red-400"}>{changePct}%</b></div>
        <div>Cao: <b className="text-slate-300">{maxPrice.toLocaleString()}</b></div>
        <div>Thap: <b className="text-slate-300">{minPrice.toLocaleString()}</b></div>
      </div>
      <div className="h-64 flex items-end justify-between gap-[2px] border-b border-slate-800/60 pb-3 pt-12">
        {bars.map((bar, i) => {
          const isGreen = bar.close >= bar.open;
          const bodyTop = toPct(Math.max(bar.open, bar.close));
          const bodyBottom = toPct(Math.min(bar.open, bar.close));
          const wickTop = toPct(bar.high);
          const wickBottom = toPct(bar.low);
          return (
            <div key={i} className="flex-1 flex flex-col items-center h-full justify-end relative" title={`${bar.date}: C${bar.close}`}>
              <div className="w-[1.5px] bg-slate-600 absolute" style={{ height: `${wickTop - wickBottom}%`, bottom: `${wickBottom}%` }} />
              <div className={`w-full rounded-sm ${isGreen ? "bg-emerald-500/80" : "bg-red-500/80"}`}
                style={{ height: `${Math.max(1, bodyTop - bodyBottom)}%`, position: "absolute", bottom: `${bodyBottom}%` }} />
            </div>
          );
        })}
      </div>
      <p className="text-[9px] text-slate-600 mt-2">HARD_DATA tu Yahoo Finance, {bars.length} phien gan nhat.</p>
    </div>
  );
}

// ============ VE VUNG AI - dung ChartDrawingPanel + Controller ============
function VeVungAISection({ ticker }: { ticker: string }) {
  const { bars, isLoading, error } = useOhlcvData(ticker, "3mo");

  if (isLoading) return (
    <div className="h-64 flex items-center justify-center gap-2 text-xs text-slate-400">
      <RefreshCw className="w-4 h-4 animate-spin" /> Dang tai du lieu cho {ticker}...
    </div>
  );
  if (error) return (
    <div className="h-64 flex items-center justify-center gap-2 text-xs text-red-300">
      <AlertCircle className="w-4 h-4" /> Khong co du lieu cho {ticker}.
    </div>
  );

  return <ChartDrawingPanel bars={bars} ticker={ticker} />;
}

// ============ CONFIDENCE BADGE ============
function ConfidenceBadge({ score, confluence }: { score: number; confluence: number }) {
  const color = score >= 70 ? "#34d399" : score >= 50 ? "#fbbf24" : "#f87171";
  return (
    <div className="flex items-center gap-1.5">
      <span style={{ color, background: `${color}18`, border: `1px solid ${color}40` }} className="text-[9px] font-bold px-1.5 py-0.5 rounded-full">{score}đ</span>
      <span className="text-[9px] text-slate-500">{confluence}/4 ĐT</span>
    </div>
  );
}

function DataQualityBadge({ quality }: { quality: string }) {
  if (quality === "HARD_DATA") return <span className="flex items-center gap-0.5 text-[8px] text-emerald-400"><CheckCircle2 className="w-2.5 h-2.5" />THỰC</span>;
  if (quality === "ESTIMATED") return <span className="text-[8px] text-amber-400">~ƯỚC</span>;
  return <span className="text-[8px] text-slate-600">?</span>;
}

export default function TaTab({
  taMode, setTaMode, rrgSectors, selectedRrgSector, setSelectedRrgSector,
  quantRadarTab, setQuantRadarTab, tang4Result: _tang4Result, selectedStockId, setSelectedStockId, setActiveTab,
}: TaTabProps) {
  const selectedRrgSectorDetails = rrgSectors.find((s) => s.name === selectedRrgSector) || rrgSectors[0];
  const { scoredData, isLoading: scoreLoading, refresh: scoreRefresh } = useScoredStocks();

  const goldenFilter = scoredData?.goldenFilter ?? [];
  const bearTrap = scoredData?.bearTrap ?? [];
  const foreignAccum = scoredData?.foreignAccum ?? [];
  const top20 = scoredData?.top20 ?? [];

  return (
    <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-6 shadow-xl space-y-6">

      {/* HEADER + MODE SWITCH */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/60 pb-4">
        <div>
          <h3 className="text-sm font-bold uppercase text-slate-100 flex items-center gap-1.5"><Activity className="w-4 h-4 text-emerald-400" />Truc Quan Hoa Do Thi & Phan Tich Da Chieu</h3>
          <p className="text-xs text-slate-400 mt-1">Do thi nen thuc (Yahoo Finance), Ban do RRG, Ve Vung AI, hoac Command Center day du.</p>
        </div>
        <div style={{ background: "rgba(2,6,15,0.7)", border: "1px solid rgba(148,163,184,0.1)" }} className="flex gap-1 p-1 rounded-xl flex-wrap">
          {["Nen Thuc", "RRG", "Ve Vung AI", "Command Center"].map((mode) => (
            <button key={mode} onClick={() => setTaMode(mode)}
              style={taMode === mode ? { background: "linear-gradient(135deg, #fbbf24, #f59e0b)" } : {}}
              className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition ${taMode === mode ? "text-slate-950" : "text-slate-400 hover:text-slate-200"}`}>
              {mode === "RRG" ? "Ban Do RRG" : mode === "Ve Vung AI" ? "Vẽ Vùng AI" : mode === "Command Center" ? "Command Center" : "Do Thi Nen Thuc"}
            </button>
          ))}
        </div>
      </div>

      {/* CHART AREA */}
      {taMode === "RRG" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="lg:col-span-2 rounded-2xl p-6 relative flex flex-col items-center">
            <div className="absolute top-3 left-3 text-[10px] font-mono text-slate-500">Benchmark: <b className="text-amber-500">VN-Index</b> <span className="text-slate-600">(minh hoa)</span></div>
            <div className="w-full flex justify-between text-[11px] font-bold text-slate-400 px-2 mb-2"><span className="text-sky-400">IMPROVING</span><span className="text-emerald-400">LEADING</span></div>
            <div style={{ border: "1px solid rgba(148,163,184,0.12)" }} className="w-full max-w-[360px] h-[320px] relative rounded-2xl">
              <svg width="100%" height="100%" viewBox="0 0 320 320" className="overflow-visible">
                <line x1="160" y1="0" x2="160" y2="320" stroke="#1e293b" strokeWidth="1.5" strokeDasharray="3,3" />
                <line x1="0" y1="160" x2="320" y2="160" stroke="#1e293b" strokeWidth="1.5" strokeDasharray="3,3" />
                <circle cx="160" cy="160" r="140" fill="none" stroke="#172033" strokeWidth="1" />
                <circle cx="160" cy="160" r="80" fill="none" stroke="#172033" strokeWidth="1" />
                {rrgSectors.map((sector, sIdx) => {
                  const isSel = selectedRrgSector === sector.name;
                  return (
                    <g key={sIdx} className="cursor-pointer" onClick={() => setSelectedRrgSector(sector.name)}>
                      <path d={`M ${sector.prevX} ${sector.prevY} Q ${(sector.prevX + sector.x) / 2 - 10} ${(sector.prevY + sector.y) / 2 - 10} ${sector.x} ${sector.y}`}
                        fill="none" stroke={sector.color} strokeWidth={isSel ? "2.5" : "1.2"} strokeDasharray={isSel ? "none" : "2,2"} opacity={isSel ? "1" : "0.5"} />
                      <circle cx={sector.x} cy={sector.y} r={isSel ? "7" : "5"} fill={sector.color} stroke="#070b14" strokeWidth="1.5" />
                      <text x={sector.x + 8} y={sector.y + 4} fill={isSel ? "#ffffff" : "#94a3b8"} fontSize={isSel ? "11" : "9"} className="font-bold select-none">{sector.name}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <div className="w-full flex justify-between text-[11px] font-bold text-slate-400 px-2 mt-2"><span className="text-red-400">LAGGING</span><span className="text-amber-500">WEAKENING</span></div>
            <p className="text-[9px] text-slate-600 mt-3">Ban do RRG dang dung du lieu minh hoa. Toa do chua tinh tu RS thuc theo nganh.</p>
          </div>
          <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3 border-b border-slate-800/60 pb-3">
              <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: selectedRrgSectorDetails.color }}></span>
              <h4 className="font-black text-sm text-slate-100 uppercase">{selectedRrgSectorDetails.name}</h4>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div style={{ background: "rgba(14,22,38,0.7)", border: "1px solid rgba(148,163,184,0.1)" }} className="p-3 rounded-lg"><span className="text-slate-500 block uppercase text-[9px] font-bold">RS</span><span className="text-slate-200 font-mono font-bold block mt-0.5">{selectedRrgSectorDetails.rs}</span></div>
              <div style={{ background: "rgba(14,22,38,0.7)", border: "1px solid rgba(148,163,184,0.1)" }} className="p-3 rounded-lg"><span className="text-slate-500 block uppercase text-[9px] font-bold">Momentum</span><span className="text-slate-200 font-mono font-bold block mt-0.5">{selectedRrgSectorDetails.momentum}</span></div>
            </div>
            <div style={{ background: "rgba(14,22,38,0.7)", border: "1px solid rgba(148,163,184,0.1)" }} className="p-3.5 rounded-xl text-xs mt-3">
              <span className="text-slate-400 block font-bold mb-1">Goc phan tu:</span>
              <span className={`font-black uppercase text-xs ${selectedRrgSectorDetails.quadrant === "Leading" ? "text-emerald-400" : selectedRrgSectorDetails.quadrant === "Improving" ? "text-sky-400" : selectedRrgSectorDetails.quadrant === "Lagging" ? "text-red-400" : "text-amber-500"}`}>{selectedRrgSectorDetails.quadrant}</span>
            </div>
          </div>
        </div>
      )}

      {taMode === "Nen Thuc" && (
        <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5">
          <RealCandlestickChart ticker={selectedStockId} />
        </div>
      )}

      {taMode === "Ve Vung AI" && (
        <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5">
          <VeVungAISection ticker={selectedStockId} />
        </div>
      )}

      {taMode === "Command Center" && (
        <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5">
          <TaCommandCenterTab ticker={selectedStockId} />
        </div>
      )}

      {/* TERMINAL TIN HIEU DINH LUONG - GIU NGUYEN, KHONG THAY DOI */}
      <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800/60 pb-4 mb-4">
          <div>
            <h4 className="text-sm font-black text-slate-100 uppercase tracking-wide flex items-center gap-2">
              <Zap className="text-amber-500 w-5 h-5" />Terminal Tin Hieu Dinh Luong
            </h4>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Scoring: 30% Pattern + 20% Vol + 20% RS + 30% Momentum | Confluence ≥ 2/4 | Max 4 ma/nganh
            </p>
          </div>
          <div className="flex items-center gap-2">
            {scoredData && <span className="flex items-center gap-1 text-[10px] text-emerald-400"><CheckCircle2 className="w-3 h-3" />HARD_DATA ({scoredData.totalAnalyzed} ma)</span>}
            {scoreLoading && <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin" />}
            <button onClick={() => scoreRefresh()} className="text-slate-400 hover:text-slate-200 transition"><RefreshCw className="w-3.5 h-3.5" /></button>
          </div>
        </div>

        <div style={{ background: "rgba(14,22,38,0.7)", border: "1px solid rgba(148,163,184,0.1)" }} className="flex p-1 rounded-xl text-[10px] font-bold mb-4 flex-wrap gap-1">
          {[
            { id: "golden", label: "✦ Golden Filter", icon: Star },
            { id: "beartrap", label: "⚡ Bay Giam Gia", icon: TrendingDown },
            { id: "foreign", label: "🏦 Quy Ngoai Gom", icon: TrendingUp },
            { id: "top20", label: "🏆 Top 20 Tong Hop", icon: Shield },
          ].map((t) => (
            <button key={t.id} onClick={() => setQuantRadarTab(t.id)}
              style={quantRadarTab === t.id ? { background: "linear-gradient(135deg, #fbbf24, #f59e0b)" } : {}}
              className={`px-3 py-1.5 rounded-lg transition flex-1 min-w-[100px] text-center ${quantRadarTab === t.id ? "text-slate-950 font-black" : "text-slate-400 hover:text-slate-200"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {scoreLoading && !scoredData && (
          <div className="flex items-center gap-2 text-xs text-slate-400 py-8 justify-center">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Dang chay Scoring Algorithm (Confluence Check + BB Contraction)...
          </div>
        )}

        {quantRadarTab === "golden" && (
          <div>
            <p className="text-[10px] text-slate-500 mb-3 italic">MA50 safe + RS duong + Confluence ≥ 3/4. BB Contraction bonus +20% khi sap breakout.</p>
            {goldenFilter.length === 0 && !scoreLoading && <p className="text-xs text-slate-500 italic py-4 text-center">Khong co ma nao dat tieu chuan Golden Filter hom nay.</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead><tr className="border-b border-slate-800/60 text-slate-400 text-[10px] uppercase">
                  <th className="pb-2">Ma</th><th className="pb-2">Nganh</th><th className="pb-2 text-center">Diem/ĐT</th>
                  <th className="pb-2 text-right">RS 3T</th><th className="pb-2 text-right">Vol</th>
                  <th className="pb-2 text-center">BB</th><th className="pb-2 text-center">Data</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-800/30">
                  {goldenFilter.map((s: any, i: number) => (
                    <tr key={i} onClick={() => { setSelectedStockId(s.ticker); setActiveTab("elite"); }} className="hover:bg-slate-900/30 transition cursor-pointer">
                      <td className="py-2.5 font-black text-amber-400">{s.ticker}</td>
                      <td className="py-2.5 text-slate-400 text-[10px]">{s.sector}</td>
                      <td className="py-2.5 text-center"><ConfidenceBadge score={s.scores.total} confluence={s.scores.confluence} /></td>
                      <td className="py-2.5 text-right font-mono"><span className={s.rs3m >= 0 ? "text-emerald-400" : "text-red-400"}>{s.rs3m !== null ? `${s.rs3m >= 0 ? "+" : ""}${s.rs3m}%` : "-"}</span></td>
                      <td className="py-2.5 text-right font-mono text-slate-300">{s.volumeSpikeRatio !== null ? `${s.volumeSpikeRatio}x` : "-"}</td>
                      <td className="py-2.5 text-center">{s.isContracting ? <span className="text-[9px] text-purple-400 font-bold">TIGHT</span> : <span className="text-slate-600 text-[9px]">-</span>}</td>
                      <td className="py-2.5 text-center"><DataQualityBadge quality={s.dataQuality} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {quantRadarTab === "beartrap" && (
          <div>
            <p className="text-[10px] text-slate-500 mb-3 italic">Ma co MA50 broken HOAC RS duoi -5%. Canh bao rui ro - tranh mua vao.</p>
            {bearTrap.length === 0 && !scoreLoading && <p className="text-xs text-slate-500 italic py-4 text-center">Khong co ma nao trong vung canh bao hom nay.</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead><tr className="border-b border-slate-800/60 text-slate-400 text-[10px] uppercase">
                  <th className="pb-2">Ma</th><th className="pb-2">MA50</th>
                  <th className="pb-2 text-right">RS 3T</th><th className="pb-2 text-right">Vol</th><th className="pb-2">Canh Bao</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-800/30">
                  {bearTrap.map((s: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-900/30 transition">
                      <td className="py-2.5 font-black text-red-400">{s.ticker}</td>
                      <td className="py-2.5">
                        {s.ma50Status === "broken" && <span className="text-[9px] text-red-400 font-bold bg-red-500/10 px-1.5 py-0.5 rounded">BROKEN</span>}
                        {s.ma50Status === "warning" && <span className="text-[9px] text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded">WARN</span>}
                        {s.ma50Status === "safe" && <span className="text-[9px] text-slate-500">safe</span>}
                      </td>
                      <td className="py-2.5 text-right font-mono text-red-400">{s.rs3m !== null ? `${s.rs3m}%` : "-"}</td>
                      <td className="py-2.5 text-right font-mono text-slate-300">{s.volumeSpikeRatio !== null ? `${s.volumeSpikeRatio}x` : "-"}</td>
                      <td className="py-2.5 text-[9px] text-red-300 max-w-[180px]">{s.riskFlags?.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {quantRadarTab === "foreign" && (
          <div>
            <p className="text-[10px] text-slate-500 mb-3 italic">RS duong cao + Vol Spike &gt; 1.3x + MA50 khong broken. Proxy dong ngoai gom (HARD_DATA RS, ESTIMATED foreign flow).</p>
            {foreignAccum.length === 0 && !scoreLoading && <p className="text-xs text-slate-500 italic py-4 text-center">Khong co ma nao thoa dieu kien Quy Ngoai Gom hom nay.</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead><tr className="border-b border-slate-800/60 text-slate-400 text-[10px] uppercase">
                  <th className="pb-2">Ma</th><th className="pb-2">Nganh</th>
                  <th className="pb-2 text-right">RS 3T (HARD)</th><th className="pb-2 text-right">Vol (HARD)</th>
                  <th className="pb-2 text-center">MA50</th><th className="pb-2 text-center">Diem</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-800/30">
                  {foreignAccum.map((s: any, i: number) => (
                    <tr key={i} onClick={() => { setSelectedStockId(s.ticker); setActiveTab("elite"); }} className="hover:bg-slate-900/30 transition cursor-pointer">
                      <td className="py-2.5 font-black text-amber-400">{s.ticker}</td>
                      <td className="py-2.5 text-slate-400 text-[10px]">{s.sector}</td>
                      <td className="py-2.5 text-right font-mono text-emerald-400 font-bold">+{s.rs3m}%</td>
                      <td className="py-2.5 text-right font-mono text-sky-400">{s.volumeSpikeRatio}x</td>
                      <td className="py-2.5 text-center"><span className="text-[9px] text-emerald-400 font-bold">safe</span></td>
                      <td className="py-2.5 text-center"><ConfidenceBadge score={s.scores.total} confluence={s.scores.confluence} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {quantRadarTab === "top20" && (
          <div>
            {scoredData && (
              <div className="flex flex-wrap gap-3 mb-3 text-[9px]">
                <span className="text-slate-500">Phan tich: <b className="text-slate-300">{scoredData.totalAnalyzed}</b> ma</span>
                <span className="text-slate-600">→</span>
                <span className="text-slate-500">Confluence ≥2: <b className="text-slate-300">{scoredData.afterConfluenceFilter}</b> ma</span>
                <span className="text-slate-600">→</span>
                <span className="text-slate-500">Stress test (da nganh): <b className="text-amber-400">{scoredData.top20?.length ?? 0}</b> ma</span>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead><tr className="border-b border-slate-800/60 text-slate-400 text-[10px] uppercase">
                  <th className="pb-2 w-5">#</th><th className="pb-2">Ma</th><th className="pb-2">Nganh</th>
                  <th className="pb-2 text-right">Diem</th><th className="pb-2 text-right">RS</th>
                  <th className="pb-2 text-center">MA50</th><th className="pb-2 text-right">Vol</th>
                  <th className="pb-2 text-center">BB</th><th className="pb-2 text-center">ĐT</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-800/30">
                  {top20.map((s: any, i: number) => (
                    <tr key={i} onClick={() => { setSelectedStockId(s.ticker); setActiveTab("elite"); }} className="hover:bg-slate-900/30 transition cursor-pointer">
                      <td className="py-2 text-slate-600 font-mono text-[10px]">{i + 1}</td>
                      <td className="py-2 font-black text-amber-400">{s.ticker}</td>
                      <td className="py-2 text-slate-400 text-[10px]">{s.sector}</td>
                      <td className="py-2 text-right">
                        <span style={{ background: s.scores.total >= 70 ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)", color: s.scores.total >= 70 ? "#34d399" : "#fbbf24" }} className="font-black font-mono px-2 py-0.5 rounded-full text-[10px]">{s.scores.total}</span>
                      </td>
                      <td className="py-2 text-right font-mono text-[10px]">
                        <span className={s.rs3m !== null && s.rs3m >= 0 ? "text-emerald-400" : "text-red-400"}>{s.rs3m !== null ? `${s.rs3m >= 0 ? "+" : ""}${s.rs3m}%` : "-"}</span>
                      </td>
                      <td className="py-2 text-center text-[9px]">
                        {s.ma50Status === "safe" && <span className="text-emerald-400">✓</span>}
                        {s.ma50Status === "warning" && <span className="text-amber-400">!</span>}
                        {s.ma50Status === "broken" && <span className="text-red-400">✗</span>}
                      </td>
                      <td className="py-2 text-right font-mono text-slate-300 text-[10px]">{s.volumeSpikeRatio !== null ? `${s.volumeSpikeRatio}x` : "-"}</td>
                      <td className="py-2 text-center">{s.isContracting ? <span className="text-[9px] text-purple-400 font-bold">●</span> : <span className="text-slate-700">-</span>}</td>
                      <td className="py-2 text-center text-[10px] font-bold text-slate-300">{s.scores.confluence}/4</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {scoredData && (
              <p className="text-[9px] text-slate-600 mt-3 flex items-center gap-1">
                <Bot className="w-3 h-3" />
                30% Pattern (RS+BB) | 20% Volume | 20% RS | 30% Momentum (MA50+Regime) — Cap nhat: {new Date(scoredData.generatedAt).toLocaleString("vi-VN")}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}