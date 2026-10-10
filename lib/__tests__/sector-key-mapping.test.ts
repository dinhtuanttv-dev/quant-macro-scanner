// Chạy: npx tsx lib/__tests__/sector-key-mapping.test.ts — L0: tên ngành cổ phiếu ↔ mã ngành RRG.
import assert from "node:assert/strict";
import { SECTOR_PROXIES, STOCK_SECTOR_TO_RRG_KEY, rrgKeyOfStockSector } from "../sector-filter/rrg/compute-rrg";
import { stockUniverse } from "../quant-data";

const rrgKeys = new Set(SECTOR_PROXIES.map((s) => s.sectorKey));
// mọi mã đích phải là một ngành RRG thật, và mọi ngành RRG phải có ít nhất một tên ngành cổ phiếu ánh xạ tới
for (const k of Object.values(STOCK_SECTOR_TO_RRG_KEY)) assert.ok(rrgKeys.has(k), `${k} không phải ngành RRG`);
for (const k of rrgKeys) assert.ok(Object.values(STOCK_SECTOR_TO_RRG_KEY).includes(k), `ngành RRG ${k} không có cổ phiếu nào`);
// mọi tên ngành nguồn phải tồn tại trong stockUniverse (không ánh xạ tên ma)
const labels = new Set(stockUniverse.map((s: { sector: string }) => s.sector));
for (const l of Object.keys(STOCK_SECTOR_TO_RRG_KEY)) assert.ok(labels.has(l), `"${l}" không có trong stockUniverse`);
assert.equal(rrgKeyOfStockSector("Ban le"), "RETAIL");
assert.equal(rrgKeyOfStockSector("Ngan hang"), "BANKING");
assert.equal(rrgKeyOfStockSector("Khu cong nghiep"), null, "ngành chưa có proxy RRG -> null (không đoán)");
const mapped = stockUniverse.filter((s: { sector: string }) => rrgKeyOfStockSector(s.sector)).length;
console.log(`sector-key-mapping: OK — ${mapped}/${stockUniverse.length} mã có ngành RRG`);
