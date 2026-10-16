import { describe, expect, it } from "vitest";
import { macroRegimeOf, RISK_ON_EVIDENCE, RISK_ON_IN_DECISION } from "@/lib/locnganh/sector-io";
import { fuseMacroAndTrendRegime } from "@/lib/locnganh/sector-regime-fusion";

describe("Risk-On KHÔNG ĐẠT kiểm định đặt trước -> bị loại khỏi quyết định Lọc ngành", () => {
  it("cờ tắt và nhãn bằng chứng là HEURISTIC_FAILED", () => {
    expect(RISK_ON_IN_DECISION).toBe(false);
    expect(RISK_ON_EVIDENCE.label).toBe("HEURISTIC_FAILED");
  });
  it("chế độ đưa vào hợp nhất là TRUNG_LAP -> chỉ còn xu hướng MA200 quyết định, bất kể điểm Risk-On", () => {
    const trend = { regime: "NEUTRAL" } as never;
    const regimeUsed = RISK_ON_IN_DECISION ? macroRegimeOf(20) : "TRUNG_LAP";
    expect(fuseMacroAndTrendRegime(regimeUsed, trend)).toBe("NEUTRAL");
    expect(fuseMacroAndTrendRegime("TRUNG_LAP", { regime: "RISK_OFF" } as never)).toBe("RISK_OFF");
    expect(macroRegimeOf(80)).toBe("RISK_ON"); // nhãn hiển thị vẫn giữ
  });
});
