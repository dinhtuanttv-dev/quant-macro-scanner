"use client";

import useSWR from "swr";
import type { WorldDataResponse } from "@/app/api/world-data/route";

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error(`API loi ${res.status}`);
  return res.json();
});

export function useWorldData(refreshIntervalMs: number = 5 * 60 * 1000) {
  const { data, error, isLoading, mutate } = useSWR<WorldDataResponse>(
    "/api/world-data",
    fetcher,
    {
      refreshInterval: refreshIntervalMs,
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    }
  );

  return { worldData: data, isLoading, error, refresh: mutate };
}