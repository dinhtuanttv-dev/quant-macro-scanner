"use client";

import useSWR from "swr";
import type { BlackSwanResponse } from "@/app/api/black-swan/route";

const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

export function useBlackSwan(refreshIntervalMs: number = 15 * 60 * 1000) {
  const { data, error, isLoading, mutate } = useSWR<BlackSwanResponse>(
    "/api/black-swan",
    fetcher,
    {
      refreshInterval: refreshIntervalMs, // 15 phut refresh 1 lan
      revalidateOnFocus: false,
      dedupingInterval: 5 * 60 * 1000,
    }
  );

  return { blackSwanData: data, isLoading, error, refresh: mutate };
}