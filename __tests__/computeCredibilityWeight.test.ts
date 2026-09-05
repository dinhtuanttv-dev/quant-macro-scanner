// __tests__/computeCredibilityWeight.test.ts
// Test cho ham thuan tuy computeCredibilityWeight - khong can mock gi ca.

import { describe, it, expect } from "vitest";
import { computeCredibilityWeight } from "@/lib/catalyst/engine/computeCredibilityWeight";

describe("computeCredibilityWeight", () => {
  it("tra ve dung 1.0 cho nguon 'confirmed' bat ke corroborationCount", () => {
    expect(computeCredibilityWeight("confirmed", 1)).toBe(1.0);
    expect(computeCredibilityWeight("confirmed", 10)).toBe(1.0);
  });

  it("tra ve dung 0.5 cho 'rumor' voi chi 1 nguon xac nhan (giu hanh vi cu)", () => {
    expect(computeCredibilityWeight("rumor", 1)).toBeCloseTo(0.5, 5);
  });

  it("tang dan theo corroborationCount nhung khong bao gio vuot 0.9", () => {
    const w1 = computeCredibilityWeight("rumor", 1);
    const w3 = computeCredibilityWeight("rumor", 3);
    const w10 = computeCredibilityWeight("rumor", 10);
    const w100 = computeCredibilityWeight("rumor", 100);

    expect(w3).toBeGreaterThan(w1);
    expect(w10).toBeGreaterThan(w3);
    expect(w100).toBeLessThan(0.9);
    expect(w100).toBeGreaterThan(0.85); // gan tiem can 0.9
  });

  it("khong bao gio vuot qua nguong 'confirmed' du corroborationCount rat lon", () => {
    const w = computeCredibilityWeight("rumor", 1000);
    expect(w).toBeLessThan(1.0);
  });
});
