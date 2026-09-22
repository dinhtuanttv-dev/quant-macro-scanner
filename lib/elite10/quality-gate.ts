// Elite 10 - Giai Trinh Hoi Tu v2. PORT TRUC TIEP tu quality_gate.py
// (Phan I/II - Data Quality Gate). Moi nguon du lieu PHAI di qua day
// truoc khi dung trong Scoring Engine.

export type DataStatus = "VALID" | "STALE" | "SUSPECT" | "MISSING";

export interface SourceData {
  pillar: string;
  signalValue: number | null;
  lastUpdate: number; // unix seconds
  rollingMean90d: number;
  rollingStd90d: number;
  raw: Record<string, unknown>;
  status?: DataStatus;
}

export const STALENESS_THRESHOLD_SEC = 5;
export const OUTLIER_SIGMA = 4.0;

export function dataQualityGate(source: SourceData, nowSec: number): DataStatus {
  if (source.signalValue === null) return "MISSING";

  const deltaT = nowSec - source.lastUpdate;
  if (deltaT > STALENESS_THRESHOLD_SEC) return "STALE";

  if (source.rollingStd90d > 0) {
    const z = Math.abs(source.signalValue - source.rollingMean90d) / source.rollingStd90d;
    if (z > OUTLIER_SIGMA) return "SUSPECT";
  }
  return "VALID";
}

export function applyQualityGate(sources: Record<string, SourceData>, nowSec: number): Record<string, SourceData> {
  for (const key of Object.keys(sources)) {
    sources[key].status = dataQualityGate(sources[key], nowSec);
  }
  return sources;
}
