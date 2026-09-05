// __tests__/computeFreshnessScore.test.ts

import { describe, it, expect } from "vitest";
import { computeFreshnessScore, isConsideredNew } from "@/lib/catalyst/engine/computeFreshnessScore";

describe("computeFreshnessScore", () => {
  it("tra ve gan 1 khi vua phat hien", () => {
    const score = computeFreshnessScore(new Date());
    expect(score).toBeGreaterThan(0.95);
  });

  it("tra ve dung 0.5 sau dung 1 half-life (2 gio)", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000);
    const score = computeFreshnessScore(twoHoursAgo);
    expect(score).toBeCloseTo(0.5, 1);
  });

  it("giam dan theo thoi gian, khong bao gio am", () => {
    const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000);
    const score = computeFreshnessScore(oneDayAgo);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThan(0.1);
  });

  it("isConsideredNew giu dung hanh vi nhi phan cu (nguong 2h)", () => {
    const oneHourAgo = new Date(Date.now() - 1 * 3600 * 1000);
    const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000);
    expect(isConsideredNew(oneHourAgo)).toBe(true);
    expect(isConsideredNew(threeHoursAgo)).toBe(false);
  });
});
