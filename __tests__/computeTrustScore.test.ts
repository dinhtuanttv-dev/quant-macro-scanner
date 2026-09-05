// __tests__/computeTrustScore.test.ts

import { describe, it, expect } from "vitest";
import { computeTrustScore, trustScoreLabel } from "@/lib/catalyst/engine/computeTrustScore";

describe("computeTrustScore", () => {
  it("diem cao nhat khi confirmed, nhieu nguon, vua phat hien", () => {
    const score = computeTrustScore({
      corroborationCount: 10,
      sourceCredibility: "confirmed",
      firstDetectedAt: new Date(), // vua xong
    });
    expect(score).toBeGreaterThanOrEqual(90);
  });

  it("diem thap khi rumor, 1 nguon, da cu (30 ngay truoc)", () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const score = computeTrustScore({
      corroborationCount: 1,
      sourceCredibility: "rumor",
      firstDetectedAt: thirtyDaysAgo,
    });
    expect(score).toBeLessThan(40);
  });

  it("luon nam trong khoang 0-100", () => {
    const score = computeTrustScore({
      corroborationCount: 0,
      sourceCredibility: "rumor",
      firstDetectedAt: new Date(Date.now() - 365 * 24 * 3600 * 1000),
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("trustScoreLabel tra ve dung nhan theo nguong", () => {
    expect(trustScoreLabel(90)).toBe("Rat dang tin");
    expect(trustScoreLabel(70)).toBe("Dang tin");
    expect(trustScoreLabel(50)).toBe("Can theo doi them");
    expect(trustScoreLabel(20)).toBe("Chua du co so");
  });
});
