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

export function useOhlcvData(ticker: string | null, range: string = "3mo") {
  const { data, error, isLoading } = useSWR<OhlcvApiResponse>(
    ticker ? `/api/ohlcv?ticker=${encodeURIComponent(ticker)}&range=${range}` : null,
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