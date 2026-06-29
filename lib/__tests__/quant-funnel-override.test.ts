// ============================================================
// UNIT TEST cho quant-funnel-override.ts
// Chay doc lap: npx tsx lib/__tests__/quant-funnel-override.test.ts
// ============================================================

import { overrideTang4WithRealData } from "../quant-funnel-override";
import type { Tang4Stock } from "../quant-funnel";
import type { MarketDataResponse } from "../../app/api/market-data/route";

let passCount = 0;
let failCount = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    passCount++;
    console.log(`  PASS: ${label}`);
  } else {
    failCount++;
    console.error(`  FAIL: ${label}`);
  }
}

const mockTang4Stock: Tang4Stock = {
  ticker: "FPT",
  sector: "Cong nghe",
  epsGrowth: 24.5,
  faScore: 92,
  tang1Score: 100,
  tang1Member: true,
  globalSync: true,
  commoditySync: false,
  tang2Score: 120,
  sectorStrength: 90,
  tang3Score: 140,
  taData: { pattern: "Nen phang", breakout: true, volSpike: 1.5, foreignNet: 100, leader: true, ma50Status: "safe" },
  tang4Score: 160,
};

console.log("\n=== TEST: marketData null/undefined ===");
{
  const result = overrideTang4WithRealData([mockTang4Stock], null);
  check("Tra ve dung so luong ma", result.length === 1);
  check("isRealData = false khi marketData null", result[0].isRealData === false);
  check("Giu nguyen tang4Score goc khi chua co du lieu thuc", result[0].tang4Score === mockTang4Stock.tang4Score);
}

console.log("\n=== TEST: ma co du lieu thuc hop le ===");
{
  const marketData: MarketDataResponse = {
    generatedAt: new Date().toISOString(),
    vnIndexLatestClose: 1800,
    tickers: [
      { ticker: "FPT", latestClose: 70000, ma50: 73000, ma50Status: "broken", relativeStrength3m: -5, volumeSpikeRatio: 2.0 },
    ],
  };

  const result = overrideTang4WithRealData([mockTang4Stock], marketData);
  check("isRealData = true khi co du lieu thuc hop le", result[0].isRealData === true);
  check("ma50Status duoc cap nhat thanh 'broken' tu du lieu thuc", result[0].taData?.ma50Status === "broken");
  check("tang4Score thay doi (khac diem goc) vi MA50 chuyen tu safe sang broken", result[0].tang4Score !== mockTang4Stock.tang4Score);
  check("tang4Score moi THAP HON diem goc (vi MA50 broken la tin hieu xau)", result[0].tang4Score < mockTang4Stock.tang4Score);
}

console.log("\n=== TEST: ma bi loi (vd PVS - khong co tren Yahoo) ===");
{
  const marketData: MarketDataResponse = {
    generatedAt: new Date().toISOString(),
    vnIndexLatestClose: 1800,
    tickers: [
      { ticker: "PVS", latestClose: null, ma50: null, ma50Status: "safe", relativeStrength3m: null, volumeSpikeRatio: null, error: "HTTP 404" },
    ],
  };
  const pvsStock: Tang4Stock = { ...mockTang4Stock, ticker: "PVS" };

  const result = overrideTang4WithRealData([pvsStock], marketData);
  check("isRealData = false khi ma co error", result[0].isRealData === false);
  check("Giu nguyen tang4Score goc (data mau) khi ma loi", result[0].tang4Score === pvsStock.tang4Score);
  check("realDataNote co chua thong tin loi", result[0].realDataNote?.includes("404") ?? false);
}

console.log("\n=== TEST: ma khong nam trong danh sach tra ve (ngoai pham vi limit) ===");
{
  const marketData: MarketDataResponse = {
    generatedAt: new Date().toISOString(),
    vnIndexLatestClose: 1800,
    tickers: [],
  };

  const result = overrideTang4WithRealData([mockTang4Stock], marketData);
  check("isRealData = false khi ma khong co trong response", result[0].isRealData === false);
  check("Giu nguyen tang4Score goc khi ma khong nam trong pham vi lay du lieu", result[0].tang4Score === mockTang4Stock.tang4Score);
}

console.log(`\n=== KET QUA: ${passCount} PASS / ${failCount} FAIL ===\n`);
if (failCount > 0) {
  process.exit(1);
}