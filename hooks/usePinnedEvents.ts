// hooks/usePinnedEvents.ts
// Quan ly state ghim su kien vao ma co phieu, co optimistic update de UI phan hoi
// tuc thi khi bam nut, khong doi round-trip API roi moi cap nhat giao dien.

"use client";

import { useState, useEffect, useCallback } from "react";
import type { PinMap } from "@/lib/types/siu-quet-ai";
import { fetchPins, createPin, deletePin } from "@/services/pinsApi";

export function usePinnedEvents() {
  const [pins, setPins] = useState<PinMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPins()
      .then((data) => { if (!cancelled) setPins(data); })
      .catch((err) => { if (!cancelled) setError(String(err)); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const pin = useCallback(async (ticker: string, eventId: string) => {
    const previous = pins;
    setPins((prev) => ({ ...prev, [ticker]: eventId })); // optimistic update
    try {
      await createPin(ticker, eventId);
    } catch (err) {
      setPins(previous); // rollback neu that bai
      setError(String(err));
    }
  }, [pins]);

  const unpin = useCallback(async (ticker: string) => {
    const previous = pins;
    setPins((prev) => {
      const next = { ...prev };
      delete next[ticker];
      return next;
    });
    try {
      await deletePin(ticker);
    } catch (err) {
      setPins(previous);
      setError(String(err));
    }
  }, [pins]);

  return { pins, isLoading, error, pin, unpin };
}
