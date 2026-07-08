"use client";

import useSWR from "swr";
import type { OhlcvBar } from "./yahoo-finance-adapter";

interface OhlcvApiResponse {
  ticker: string;
  bars: OhlcvBar[];
}

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error(`API tra ve loi ${res.status}`);
  return res.json();
});

/**
 * Hook lay OHLCV chi tiet cho 1 ma (dung cho candlestick chart).
 * @param limit So phien toi da tra ve (mac dinh 30 - dung cho SVG
 *   chart tinh). Command Center co the truyen limit lon hon (vd 200)
 *   vi Lightweight Charts xu ly duoc nhieu nen ma khong vo layout.
 */
export function useOhlcvData(ticker: string | null, range: string = "3mo", limit: number = 30) {
  const { data, error, isLoading } = useSWR<OhlcvApiResponse>(
    ticker ? `/api/ohlcv?ticker=${encodeURIComponent(ticker)}&range=${range}&limit=${limit}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    }
  );

  return {
    bars: data?.bars ?? [],
    isLoading,
    error,
  };
}