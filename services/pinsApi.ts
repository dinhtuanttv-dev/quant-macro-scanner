// services/pinsApi.ts
// Cac ham goi fetch thuan cho /api/pins, tach khoi hook de de test doc lap
// va tai su dung neu can goi tu noi khac ngoai React component.

import type { PinMap } from "@/lib/types/siu-quet-ai";

export async function fetchPins(): Promise<PinMap> {
  const res = await fetch("/api/pins");
  if (!res.ok) throw new Error(`Khong lay duoc pins: HTTP ${res.status}`);
  const data = await res.json();
  return data.pins as PinMap;
}

export async function createPin(ticker: string, eventId: string): Promise<void> {
  const res = await fetch("/api/pins", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticker, eventId }),
  });
  if (!res.ok) throw new Error(`Ghim that bai: HTTP ${res.status}`);
}

export async function deletePin(ticker: string): Promise<void> {
  const res = await fetch("/api/pins", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticker }),
  });
  if (!res.ok) throw new Error(`Bo ghim that bai: HTTP ${res.status}`);
}
