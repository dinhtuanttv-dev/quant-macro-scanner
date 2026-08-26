export type RRGQuadrant = "Leading" | "Weakening" | "Lagging" | "Improving";

export interface RRGPoint {
  sectorKey: string;
  sectorLabel: string;
  rsRatio: number;
  rsMomentum: number;
  quadrant: RRGQuadrant;
}

function calculateRSRatio(sectorCloses: number[], benchmarkCloses: number[]): number[] {
  const ratios: number[] = [];
  for (let i = 0; i < sectorCloses.length; i++) {
    ratios.push((sectorCloses[i] / benchmarkCloses[i]) * 100);
  }
  const period = Math.min(63, ratios.length);
  const recentAvg = ratios.slice(-period).reduce((s, r) => s + r, 0) / period;
  return ratios.map((r) => (r / recentAvg) * 100);
}

function calculateRSMomentum(rsRatioSeries: number[]): number[] {
  const smoothed: number[] = [];
  const window = 10;
  for (let i = 0; i < rsRatioSeries.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = rsRatioSeries.slice(start, i + 1);
    smoothed.push(slice.reduce((s, v) => s + v, 0) / slice.length);
  }
  const momentum: number[] = [100];
  for (let i = 1; i < smoothed.length; i++) {
    const change = ((smoothed[i] - smoothed[i - 1]) / smoothed[i - 1]) * 100;
    momentum.push(100 + change * 10);
  }
  return momentum;
}

function classifyQuadrant(rsRatio: number, rsMomentum: number): RRGQuadrant {
  if (rsRatio >= 100 && rsMomentum >= 100) return "Leading";
  if (rsRatio >= 100 && rsMomentum < 100) return "Weakening";
  if (rsRatio < 100 && rsMomentum < 100) return "Lagging";
  return "Improving";
}

export function calculateSectorRRG(
  sectorKey: string, sectorLabel: string,
  sectorCloses: number[], benchmarkCloses: number[]
): RRGPoint | null {
  if (sectorCloses.length < 63 || sectorCloses.length !== benchmarkCloses.length) return null;

  const rsRatioSeries = calculateRSRatio(sectorCloses, benchmarkCloses);
  const rsMomentumSeries = calculateRSMomentum(rsRatioSeries);

  const lastIdx = rsRatioSeries.length - 1;
  const rsRatio = Math.round(rsRatioSeries[lastIdx] * 100) / 100;
  const rsMomentum = Math.round(rsMomentumSeries[lastIdx] * 100) / 100;

  return { sectorKey, sectorLabel, rsRatio, rsMomentum, quadrant: classifyQuadrant(rsRatio, rsMomentum) };
}