"use client";

import { Globe, TrendingUp, TrendingDown, Minus, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import type { Tang2Stock } from "@/lib/quant-funnel";
import { commoditiesImpact, globalIndicesSectors } from "@/lib/quant-data";
import { useWorldData } from "@/lib/market-data/useWorldData";

interface CommodityTabProps {
  globalIndicesSectors: typeof globalIndicesSectors;
  commoditiesImpact: typeof commoditiesImpact;
  tang2Result: Tang2Stock[];
  setSelectedStockId: (ticker: string) => void;
  setActiveTab: (tab: string) => void;
}

function TrendIcon({ trend }: { trend: "Up" | "Down" | "Neutral" }) {
  if (trend === "Up") return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
  if (trend === "Down") return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
  return <Minus className="w-3.5 h-3.5 text-slate-400" />;
}

export default function CommodityTab({
  tang2Result, setSelectedStockId, setActiveTab,
}: CommodityTabProps) {
  const { worldData, isLoading, error, refresh } = useWorldData();

  const indices = worldData?.items.filter((i) => i.type === "index") ?? [];
  const commodities = worldData?.items.filter((i) => i.type === "commodity") ?? [];
  const fx = worldData?.items.filter((i) => i.type === "fx") ?? [];

  return (
    <div className="space-y-6">

      <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold uppercase text-slate-100 flex items-center gap-1.5">
            <Globe className="w-4 h-4 text-sky-400" />
            Chi So Chung Khoan The Gioi (Thuc)
          </h3>
          <div className="flex items-center gap-2">
            {worldData && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                <CheckCircle2 className="w-3 h-3" /> Yahoo Finance
              </span>
            )}
            <button onClick={() => refresh()} className="text-slate-400 hover:text-slate-200 transition">
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-300 mb-3">
            <AlertCircle className="w-4 h-4" /> Khong the tai du lieu chi so the gioi luc nay.
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {isLoading && !worldData
            ? Array(7).fill(0).map((_, i) => (
                <div key={i} style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-3 animate-pulse h-20" />
              ))
            : indices.map((item) => (
                <div key={item.key} style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-slate-500 font-bold uppercase">{item.country}</span>
                    {item.error ? <AlertCircle className="w-3 h-3 text-red-400" /> : <TrendIcon trend={item.trend} />}
                  </div>
                  <p className="text-xs font-bold text-slate-300 mb-0.5">{item.label}</p>
                  {item.error ? (
                    <p className="text-[10px] text-slate-500 italic">Khong co du lieu</p>
                  ) : (
                    <>
                      <p className="text-sm font-black font-mono text-slate-100">{item.latestClose?.toLocaleString()}</p>
                      <p className={`text-[10px] font-bold font-mono ${item.changePct !== null && item.changePct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {item.changePct !== null ? `${item.changePct >= 0 ? "+" : ""}${item.changePct}%` : "-"}
                      </p>
                    </>
                  )}
                </div>
              ))
          }
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 shadow-xl">
          <h3 className="text-xs font-bold uppercase text-slate-100 flex items-center gap-1.5 mb-3">
            <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
            Hang Hoa (Thuc - Yahoo Finance)
          </h3>
          <div className="space-y-2">
            {isLoading && !worldData
              ? Array(2).fill(0).map((_, i) => <div key={i} className="h-12 rounded-xl bg-slate-800/40 animate-pulse" />)
              : commodities.map((item) => (
                  <div key={item.key} style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-300">{item.label}</p>
                      <p className="text-[10px] text-slate-500">{item.unit}</p>
                    </div>
                    <div className="text-right">
                      {item.error ? (
                        <p className="text-[10px] text-slate-500 italic">Khong co du lieu</p>
                      ) : (
                        <>
                          <p className="text-sm font-black font-mono text-amber-400">{item.latestClose?.toLocaleString()}</p>
                          <p className={`text-[10px] font-mono font-bold ${item.changePct !== null && item.changePct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {item.changePct !== null ? `${item.changePct >= 0 ? "+" : ""}${item.changePct}%` : "-"}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                ))
            }
            {commoditiesImpact.filter((c) => !["Gia Dau Brent (Tho)", "Gia Vang"].includes(c.name)).map((comm, i) => (
              <div key={i} style={{ background: "rgba(2,6,15,0.4)", border: "1px solid rgba(148,163,184,0.05)" }} className="rounded-xl p-3 flex items-center justify-between opacity-70">
                <div>
                  <p className="text-xs font-bold text-slate-400">{comm.name}</p>
                  <p className="text-[9px] text-slate-600 italic">Du lieu tham khao (chua co API thuc)</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black font-mono text-slate-300">{comm.price}</p>
                  <p className={`text-[10px] font-mono font-bold ${comm.trend === "Up" ? "text-emerald-400" : comm.trend === "Down" ? "text-red-400" : "text-slate-400"}`}>{comm.change}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 shadow-xl">
          <h3 className="text-xs font-bold uppercase text-slate-100 flex items-center gap-1.5 mb-3">
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            Ty Gia & DXY (Thuc - Yahoo Finance)
          </h3>
          <div className="space-y-2">
            {isLoading && !worldData
              ? Array(2).fill(0).map((_, i) => <div key={i} className="h-12 rounded-xl bg-slate-800/40 animate-pulse" />)
              : fx.map((item) => (
                  <div key={item.key} style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-300">{item.label}</p>
                      <p className="text-[10px] text-slate-500">{item.unit}</p>
                    </div>
                    <div className="text-right">
                      {item.error ? (
                        <p className="text-[10px] text-slate-500 italic">Khong co du lieu</p>
                      ) : (
                        <>
                          <p className="text-sm font-black font-mono text-emerald-400">{item.latestClose?.toLocaleString()}</p>
                          <p className={`text-[10px] font-mono font-bold ${item.changePct !== null && item.changePct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {item.changePct !== null ? `${item.changePct >= 0 ? "+" : ""}${item.changePct}%` : "-"}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                ))
            }
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800/60">
            <h4 className="text-[10px] font-bold uppercase text-slate-400 mb-2">Tac dong len nganh VN</h4>
            <div className="space-y-1.5">
              {globalIndicesSectors.slice(0, 4).map((item, i) => (
                <div key={i} style={{ background: "rgba(2,6,15,0.4)", border: "1px solid rgba(148,163,184,0.05)" }} className="rounded-lg p-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-300">{item.index}</span>
                    <div className="flex gap-1 flex-wrap justify-end">
                      {item.vnSectorsFavored.map((s, si) => (
                        <span key={si} style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)" }} className="text-[9px] text-emerald-400 px-1.5 py-0.5 rounded-full">{s}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 shadow-xl">
        <h3 className="text-xs font-bold uppercase text-slate-100 flex items-center gap-1.5 mb-3">
          <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
          Ma Dong Thuan Voi The Gioi (Tang 2 - {tang2Result.length} ma loc)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800/60 text-slate-400 text-[10px] uppercase">
                <th className="pb-2">Ma</th>
                <th className="pb-2">Nganh</th>
                <th className="pb-2 text-right">Diem T2</th>
                <th className="pb-2 text-right">Dong thuan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/30">
              {tang2Result.slice(0, 8).map((s, i) => (
                <tr key={i} onClick={() => { setSelectedStockId(s.ticker); setActiveTab("elite"); }} className="hover:bg-slate-800/20 transition cursor-pointer">
                  <td className="py-2 font-black text-amber-400">{s.ticker}</td>
                  <td className="py-2 text-slate-300">{s.sector}</td>
                  <td className="py-2 text-right font-mono text-slate-200">{s.tang2Score}</td>
                  <td className="py-2 text-right">
                    <span style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)" }} className="text-[9px] text-emerald-400 px-2 py-0.5 rounded-full font-bold">
                      {s.globalSync ? "Khop chi so TG" : s.commoditySync ? "Khop hang hoa" : "Dong thuan"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {worldData && (
          <p className="text-[9px] text-slate-600 mt-3">
            Cap nhat: {new Date(worldData.generatedAt).toLocaleString("vi-VN")}
          </p>
        )}
      </div>
    </div>
  );
}