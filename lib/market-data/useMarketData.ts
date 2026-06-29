"use client";

import useSWR from "swr";
import type { MarketDataResponse } from "@/app/api/market-data/route";

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error(`API tra ve loi ${res.status}`);
  return res.json();
});

/**
 * Hook lay du lieu thi truong thuc (TA indicators tu Yahoo Finance,
 * da tinh san o server qua /api/market-data).
 *
 * SWR tu dong cache va dedupe request - nhieu component cung goi
 * hook nay se chi thuc su fetch 1 lan, giam tai goi API truc tiep
 * (dung nguyen tac toi uu hieu nang da thong nhat).
 *
 * @param limit So ma muon lay (mac dinh 10, gioi han boi server)
 * @param refreshIntervalMs Tan suat tu dong refresh (mac dinh 5 phut,
 *   gia chung khoan khong can realtime cho muc dich phan tich nay)
 */
export function useMarketData(limit: number = 10, refreshIntervalMs: number = 5 * 60 * 1000) {
  const { data, error, isLoading, mutate } = useSWR<MarketDataResponse>(
    `/api/market-data?limit=${limit}`,
    fetcher,
    {
      refreshInterval: refreshIntervalMs,
      revalidateOnFocus: false, // tranh goi lai lien tuc khi nguoi dung doi tab
      dedupingInterval: 60000, // trong 60s, request giong nhau dung lai ket qua cu
    }
  );

  return {
    marketData: data,
    isLoading,
    error,
    refresh: mutate,
  };
}