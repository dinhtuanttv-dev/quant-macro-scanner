// __tests__/EdgeIndex.test.ts
// Test hanh vi Lazy Initialization + tinh dung dan cua Multi-index Map.

import { describe, it, expect } from "vitest";
import { EdgeIndex } from "@/lib/catalyst/engine/EdgeIndex";
import type { ImpactEdge } from "@/lib/catalyst/types";

function makeEdge(overrides: Partial<ImpactEdge>): ImpactEdge {
  return {
    id: "e" + Math.random(),
    sourceId: "s1",
    targetType: "ticker",
    targetId: "HPG",
    direction: "benefit",
    propagationDistance: "direct",
    hopCount: 1,
    baseWeight: 5,
    decayRate: 0.1,
    horizon: "medium",
    ...overrides,
  };
}

describe("EdgeIndex", () => {
  it("getByTicker tra ve dung edge cua ticker do, khong lan sang ticker khac", () => {
    const edges = [
      makeEdge({ targetId: "HPG", sourceId: "s1" }),
      makeEdge({ targetId: "VCB", sourceId: "s2" }),
    ];
    const index = new EdgeIndex(edges);
    expect(index.getByTicker("HPG")).toHaveLength(1);
    expect(index.getByTicker("VCB")).toHaveLength(1);
    expect(index.getByTicker("FPT")).toHaveLength(0); // khong ton tai -> mang rong, khong throw
  });

  it("getBySector va getByTicker tach biet dung theo targetType", () => {
    const edges = [
      makeEdge({ targetType: "sector", targetId: "Thep" }),
      makeEdge({ targetType: "ticker", targetId: "HPG" }),
    ];
    const index = new EdgeIndex(edges);
    expect(index.getBySector("Thep")).toHaveLength(1);
    expect(index.getByTicker("HPG")).toHaveLength(1);
    expect(index.getByTicker("Thep")).toHaveLength(0); // khong bi lan giua 2 loai
  });

  it("getBySourceId gop dung tat ca edge cung 1 nguon", () => {
    const edges = [
      makeEdge({ sourceId: "s1", targetType: "sector", targetId: "Thep" }),
      makeEdge({ sourceId: "s1", targetType: "ticker", targetId: "HPG" }),
      makeEdge({ sourceId: "s2", targetType: "ticker", targetId: "VCB" }),
    ];
    const index = new EdgeIndex(edges);
    expect(index.getBySourceId("s1")).toHaveLength(2);
    expect(index.getBySourceId("s2")).toHaveLength(1);
  });

  it("searchTickersByPrefix tim dung theo tien to, khong phan biet hoa thuong", () => {
    const edges = [
      makeEdge({ targetId: "HPG" }),
      makeEdge({ targetId: "HAH" }),
      makeEdge({ targetId: "VCB" }),
    ];
    const index = new EdgeIndex(edges);
    const results = index.searchTickersByPrefix("H");
    expect(results.sort()).toEqual(["HAH", "HPG"]);
    expect(index.searchTickersByPrefix("h")).toEqual(expect.arrayContaining(["HAH", "HPG"]));
  });

  it("getByTickers (batch) tra ve dung Map cho nhieu ticker cung luc", () => {
    const edges = [makeEdge({ targetId: "HPG" }), makeEdge({ targetId: "VCB" })];
    const index = new EdgeIndex(edges);
    const result = index.getByTickers(["HPG", "VCB", "FPT"]);
    expect(result.get("HPG")).toHaveLength(1);
    expect(result.get("VCB")).toHaveLength(1);
    expect(result.get("FPT")).toHaveLength(0);
  });

  it("mang edges rong khong gay loi, moi lookup tra ve mang rong", () => {
    const index = new EdgeIndex([]);
    expect(index.getByTicker("HPG")).toEqual([]);
    expect(index.getAllTickers()).toEqual([]);
    expect(index.getAllSectors()).toEqual([]);
  });
});
