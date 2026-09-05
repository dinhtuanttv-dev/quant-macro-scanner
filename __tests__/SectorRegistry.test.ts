// __tests__/SectorRegistry.test.ts
// Chi test ham DONG BO resolveSectorNameSync (khong can Redis) - ban async
// resolveSectorName() can mock @upstash/redis, de xuat lam integration test rieng.

import { describe, it, expect } from "vitest";
import { resolveSectorNameSync } from "@/lib/catalyst/engine/SectorRegistry";

describe("resolveSectorNameSync", () => {
  it("anh xa dung cac key da biet sang ten tieng Viet", () => {
    expect(resolveSectorNameSync("Banking")).toBe("Ngan hang");
    expect(resolveSectorNameSync("Steel")).toBe("Thep");
    expect(resolveSectorNameSync("RealEstate")).toBe("Bat dong san");
  });

  it("chuan hoa duoc bien the cung 1 key (hoa/thuong, gach duoi, khoang trang)", () => {
    expect(resolveSectorNameSync("banking")).toBe("Ngan hang");
    expect(resolveSectorNameSync("BANKING")).toBe("Ngan hang");
    expect(resolveSectorNameSync("real_estate")).toBe("Bat dong san");
    expect(resolveSectorNameSync("Real Estate")).toBe("Bat dong san");
  });

  it("loai bo hoan toan gia tri sentinel Macro_General, tra ve null", () => {
    expect(resolveSectorNameSync("Macro_General")).toBeNull();
    expect(resolveSectorNameSync("macro_general")).toBeNull();
    expect(resolveSectorNameSync("")).toBeNull();
  });

  it("tra ve null cho key hoan toan chua biet (KHONG leak tieng Anh tho ra ngoai)", () => {
    const result = resolveSectorNameSync("SomeRandomUnmappedIndustry");
    expect(result).toBeNull(); // dung, khong phai chuoi "SomeRandomUnmappedIndustry"
  });
});
