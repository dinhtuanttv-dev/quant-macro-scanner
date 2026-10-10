// Chạy: npx tsx lib/__tests__/patterns-v2-adapter.test.ts  (thêm LIVE=1 để đọc thật Gateway — chỉ đọc)
import assert from "node:assert/strict";
import { fetchPatternsV2, toLegacyPatterns } from "../market-data/patterns-v2-adapter";

const doc = {
  engine: "pring/P4", dataAsOf: "2026-10-09", generatedAt: "2026-10-09T08:45:00Z", evidence: { label: "EXPERIMENTAL" },
  results: [
    { ticker: "FPT", sector: "Tech", patterns: [{ timeframe: "D" as const, type: "RISING_WEDGE", label: "Nêm tăng", dir: "bear" as const, state: "CONFIRMED", stateLabel: "Đã xác nhận", score: 90 },
      { timeframe: "W" as const, type: "ASC_TRIANGLE", label: "Tam giác tăng", dir: "bull" as const, state: "FORMING", stateLabel: "Đang hình thành", score: 60 },
      { timeframe: "D" as const, type: "DOUBLE_BOTTOM", label: "Đáy đôi", dir: "bull" as const, state: "PULLBACK", stateLabel: "Pullback", score: 55 }] },
    { ticker: "ZZZ", sector: "Finance", patterns: [{ timeframe: "D" as const, type: "FLAG", label: "Cờ", dir: "bull" as const, state: "FORMING", stateLabel: "Đang hình thành", score: 70 }] },
    { ticker: "HPG", patterns: [{ timeframe: "D" as const, type: "HS_TOP", label: "Vai-đầu-vai", dir: "bear" as const, state: "CONFIRMED", stateLabel: "Đã xác nhận", score: 80 }] },
    { ticker: "OLD", patterns: [{ timeframe: "D" as const, type: "FLAG", label: "Cờ", dir: "bull" as const, state: "FAILED", stateLabel: "Thất bại", score: 80 }] },
  ],
};

async function main() {
  const s = toLegacyPatterns(doc);
  assert.equal(s.source, "GATEWAY_PATTERNS_V2");
  assert.deepEqual(s.matches.map((m) => m.ticker), ["FPT", "ZZZ"], "chỉ mô hình tăng còn hiệu lực / đang hình thành; bỏ giảm, bỏ thất bại");
  assert.equal(s.matches[0].pattern, "DOUBLE_BOTTOM", "ưu tiên mô hình đang hiệu lực hơn mô hình đang hình thành");
  assert.equal(s.matches[0].status, "confirmed");
  assert.equal(s.matches[1].status, "forming");
  assert.equal(s.matches[1].sector, "Finance");
  assert.equal(s.evidenceLabel, "EXPERIMENTAL");
  await assert.rejects(() => fetchPatternsV2((async () => new Response("x", { status: 503 })) as typeof fetch), /503/);
  if (process.env.LIVE === "1") {
    const live = await fetchPatternsV2();
    assert.ok(live.matches.length > 0);
    console.log(`LIVE: ${live.engine} · phiên ${live.dataAsOf} · ${live.matches.length} mã có mô hình tăng · ${live.matches.filter((m) => m.status === "confirmed").length} đang hiệu lực · bằng chứng ${live.evidenceLabel}`);
  }
  console.log("patterns-v2-adapter: OK");
}
main().catch((e) => { console.error(e); process.exit(1); });
