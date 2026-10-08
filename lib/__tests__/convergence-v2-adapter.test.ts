// Chạy: npx tsx lib/__tests__/convergence-v2-adapter.test.ts  (thêm LIVE=1 để đọc thật Gateway — chỉ đọc)
import assert from "node:assert/strict";
import { fetchConvergenceV2, toLegacyConvergence } from "../market-data/convergence-v2-adapter";

const doc = {
  engine: "convergence-v2/H1", dataAsOf: "2026-10-08", generatedAt: "2026-10-08T08:45:00Z", evidence: { label: "EXPERIMENTAL" },
  results: [
    { ticker: "FPT", sector: "Technology Services", side: "buy" as const, status: "WATCH" as const, grade: "B" as const, metrics: { score: 55 }, wyckoff: { phase: "spring" } },
    { ticker: "ZZZ", sector: "Finance", side: "buy" as const, status: "READY" as const, grade: "A" as const, metrics: { score: 80 }, wyckoff: { phase: "markup" } },
    { ticker: "HPG", sector: "Non-Energy Minerals", side: "sell" as const, status: "READY" as const, grade: "A" as const, metrics: { score: 90 }, wyckoff: { phase: "decline" } },
  ],
};

async function main() {
const s = toLegacyConvergence(doc);
assert.equal(s.source, "GATEWAY_CONVERGENCE_V2");
assert.deepEqual(s.results.map((r) => r.ticker), ["ZZZ", "FPT"], "chỉ phía mua, sắp theo điểm giảm dần");
assert.deepEqual(Object.keys(s.results[0]).sort(), ["compositeScore", "grade", "sector", "status", "ticker", "wyckoffPhase"]);
assert.equal(s.results[1].wyckoffPhase, "spring");
assert.notEqual(s.results[1].sector, "Technology Services", "FPT có trong stockUniverse -> dùng ngành của Project A");
assert.equal(s.results[0].sector, "Finance", "mã ngoài stockUniverse -> ngành của Gateway");
assert.equal(s.evidenceLabel, "EXPERIMENTAL");

// Gateway lỗi -> ném lỗi (route tự trả 502 / bỏ Decorrelation như trước).
await assert.rejects(() => fetchConvergenceV2((async () => new Response("x", { status: 503 })) as typeof fetch), /503/);

if (process.env.LIVE === "1") {
  const live = await fetchConvergenceV2();
  assert.ok(live.results.length > 0, "Gateway có kết quả phía mua");
  console.log(`LIVE: ${live.engine} · phiên ${live.dataAsOf} · ${live.results.length} mã phía mua · bằng chứng ${live.evidenceLabel} · top ${live.results.slice(0, 3).map((r) => `${r.ticker} ${r.compositeScore}`).join(", ")}`);
}
console.log("convergence-v2-adapter: OK");
}
main().catch((e) => { console.error(e); process.exit(1); });
