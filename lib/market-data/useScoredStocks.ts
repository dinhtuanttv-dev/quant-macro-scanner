"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

export function useScoredStocks() {
  const { data, error, isLoading, mutate } = useSWR(
    "/api/scored-stocks?top=20",
    fetcher,
    {
      refreshInterval: 10 * 60 * 1000, // 10 phut (tinh toan nang hon)
      revalidateOnFocus: false,
      dedupingInterval: 5 * 60 * 1000,
    }
  );

  return {
    scoredData: data,
    isLoading,
    error,
    refresh: mutate,
  };
}