export type RRGQuadrant = "Leading" | "Weakening" | "Lagging" | "Improving";

export interface ConfluenceInput {
  ticker: string;
  sectorKey: string;
  sectorQuadrant: RRGQuadrant;
  rs3m: number | null;
  volumeSpikeRatio: number | null;
}

export interface ConfluenceResult extends ConfluenceInput {
  rrgScore: number;
  rsScore: number;
  volumeScore: number;
  confluenceScore: number;
}

const QUADRANT_SCORE: Record<RRGQuadrant, number> = { Leading: 100, Improving: 70, Weakening: 40, Lagging: 10 };

function scoreRS(rs: number | null): number {
  if (rs === null) return 0;
  return Math.max(0, Math.min(100, Math.round(((rs + 20) / 40) * 100)));
}

function scoreVolume(ratio: number | null): number {
  if (ratio === null) return 0;
  return Math.max(0, Math.min(100, Math.round(((ratio - 0.5) / 2.5) * 100)));
}

export function calculateConfluenceScore(input: ConfluenceInput): ConfluenceResult {
  const rrgScore = QUADRANT_SCORE[input.sectorQuadrant];
  const rsScore = scoreRS(input.rs3m);
  const volumeScore = scoreVolume(input.volumeSpikeRatio);
  const confluenceScore = Math.round(rrgScore * 0.3 + rsScore * 0.4 + volumeScore * 0.3);
  return { ...input, rrgScore, rsScore, volumeScore, confluenceScore };
}

export function rankTop20(inputs: ConfluenceInput[]): ConfluenceResult[] {
  return inputs.map(calculateConfluenceScore).sort((a, b) => b.confluenceScore - a.confluenceScore).slice(0, 20);
}