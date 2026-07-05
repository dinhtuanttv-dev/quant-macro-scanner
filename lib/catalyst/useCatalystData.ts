// lib/catalyst/useCatalystData.ts
"use client";

import { useEffect, useState } from "react";
import type {
  SectorRanking,
  TopMoverEntry,
  EmergingSourceCard,
} from "./CatalystEngine";
import type { TriggeredAlert } from "./types";

export interface CatalystSnapshot {
  scannedAt: string;
  sectors: SectorRanking[];
  emerging: EmergingSourceCard[];
  upMovers: TopMoverEntry[];
  downMovers: TopMoverEntry[];
  totalBenefitCount: number;
  totalHarmCount: number;
  activeAlerts: TriggeredAlert[];
}

export function useCatalystData(pollMs = 60_000) {
  const [data, setData] = useState<CatalystSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/catalysts/latest");
        if (!res.ok) throw new Error("Chua co du lieu catalyst - cho lan quet cron dau tien");
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    const interval = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pollMs]);

  return { data, error, isLoading };
}