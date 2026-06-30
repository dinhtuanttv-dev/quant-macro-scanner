"use client";

import { AlertCircle, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { useMarketData } from "@/lib/market-data/useMarketData";

export default function RealMarketDataPanel({ limit = 60 }: { limit?: number }) {
  const { marketData, isLoading, error, refresh } = useMarketData(limit);

  if (isLoading && !marketData) {
    return (
      <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-xl p-5 flex items-center gap-2 text-xs text-slate-400">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Dang tai du lieu thuc tu Yahoo Finance...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)" }} className="rounded-xl p-5 text-xs text-red-300 flex items-center gap-2">
        <AlertCircle className="w-4 h-4 shrink-0" />
        Khong the tai du lieu thi truong thuc luc nay. Vui long thu lai sau.
      </div>
    );
  }

  if (!marketData) return null;

  const successCount = marketData.tickers.filter((t) => !t.error).length;
  const failedTickers = marketData.tickers.filter((t) => t.error);

  return (
    <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-black text-slate-100 uppercase tracking-wider">
          Du Lieu Thuc (Yahoo Finance) - {successCount}/{marketData.tickers.length} ma
        </h3>
        <button onClick={() => refresh()} className="text-slate-400 hover:text-slate-200 transition">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {marketData.vnIndexLatestClose !== null && (
        <p className="text-[11px] text-slate-400 mb-3">
          VN-Index gan nhat: <span className="font-mono font-bold text-amber-400">{marketData.vnIndexLatestClose.toFixed(2)}</span>
        </p>
      )}

      <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 bg-[#0e1626]">
            <tr className="border-b border-slate-800/60 text-slate-400 text-[10px] uppercase">
              <th className="pb-2">Ma</th>
              <th className="pb-2 text-right">Gia Dong Cua</th>
              <th className="pb-2 text-right">MA50</th>
              <th className="pb-2 text-center">Trang Thai</th>
              <th className="pb-2 text-right">RS 3 Thang</th>
              <th className="pb-2 text-right">Vol Spike</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/30">
            {marketData.tickers.map((t) => {
              if (t.error) {
                return (
                  <tr key={t.ticker} className="opacity-50">
                    <td className="py-2 font-black text-slate-400">{t.ticker}</td>
                    <td colSpan={5} className="py-2 text-slate-500 italic">
                      Khong co du lieu (co the do niem yet tren HNX, Yahoo khong ho tro)
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={t.ticker} className="hover:bg-slate-800/20 transition">
                  <td className="py-2 font-black text-amber-400">{t.ticker}</td>
                  <td className="py-2 text-right font-mono text-slate-200">{t.latestClose?.toLocaleString() ?? "-"}</td>
                  <td className="py-2 text-right font-mono text-slate-400">{t.ma50?.toLocaleString() ?? "-"}</td>
                  <td className="py-2 text-center">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        t.ma50Status === "safe" ? "bg-emerald-500/10 text-emerald-400" :
                        t.ma50Status === "warning" ? "bg-amber-500/10 text-amber-400" :
                        "bg-red-500/10 text-red-400"
                      }`}
                    >
                      {t.ma50Status}
                    </span>
                  </td>
                  <td className="py-2 text-right font-mono">
                    {t.relativeStrength3m !== null ? (
                      <span className={`flex items-center justify-end gap-1 ${t.relativeStrength3m >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {t.relativeStrength3m >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {t.relativeStrength3m}%
                      </span>
                    ) : "-"}
                  </td>
                  <td className="py-2 text-right font-mono text-slate-300">{t.volumeSpikeRatio ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {failedTickers.length > 0 && (
        <p className="text-[10px] text-slate-500 mt-3">
          {failedTickers.length} ma khong lay duoc du lieu thuc: {failedTickers.map((t) => t.ticker).join(", ")}.
          Cac ma nay van dung diem so tu data mau o cac tang loc khac.
        </p>
      )}

      <p className="text-[9px] text-slate-600 mt-2">
        Cap nhat: {new Date(marketData.generatedAt).toLocaleString("vi-VN")}
      </p>
    </div>
  );
}