"use client";
import { RefreshCw, AlertCircle } from "lucide-react";
import { useOhlcvData } from "@/lib/market-data/useOhlcvData";
import TVChartPanel from "./TVChartPanel";

export default function TaCommandCenterTab({ ticker }: { ticker: string }) {
  const { bars, isLoading, error } = useOhlcvData(ticker, "6mo");

  if (isLoading) return <div className="h-64 flex items-center justify-center gap-2 text-xs text-slate-400"><RefreshCw className="w-4 h-4 animate-spin" /> Đang tải dữ liệu cho {ticker}...</div>;
  if (error) return <div className="h-64 flex items-center justify-center gap-2 text-xs text-red-300"><AlertCircle className="w-4 h-4" /> Không có dữ liệu cho {ticker}.</div>;

  return <TVChartPanel bars={bars} ticker={ticker} />;
}