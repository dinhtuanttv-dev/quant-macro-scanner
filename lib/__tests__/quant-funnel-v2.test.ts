// ============================================================
// UNIT TEST cho 4 tang loc (quant-funnel-v2.ts)
// Chay doc lap, KHONG can npm run dev:
//   npx tsx lib/__tests__/quant-funnel-v2.test.ts
// ============================================================

import {
  runTang0Eligibility, computeTang1V2, computeTang2V2, computeTang3V2, computeTang4V2,
  computeConfluenceV2,
} from "../quant-funnel-v2";
import { stockUniverseV2 } from "../quant-data-v2";

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

console.log("\n=== TEST: Tang 0 - Eligibility ===");
{
  const results = runTang0Eligibility(stockUniverseV2);
  check("Tra ve dung so luong ma nhu input", results.length === stockUniverseV2.length);
  check("FPT (thanh khoan cao, da niem yet lau) phai eligible", results.find((r) => r.ticker === "FPT")?.isEligible === true);
  check("Moi ma eligible deu co failedReasons rong", results.filter((r) => r.isEligible).every((r) => r.failedReasons.length === 0));
}

console.log("\n=== TEST: Tang 1 - FA Score 4 nhom ===");
{
  const eligible = new Set(stockUniverseV2.map((s) => s.ticker));
  const tang1 = computeTang1V2(stockUniverseV2, eligible);
  check("Tra ve dung so luong ma eligible", tang1.length === eligible.size);
  check("Ket qua duoc sap xep giam dan theo faScoreTotal", tang1.every((s, i) => i === 0 || tang1[i - 1].faScoreTotal >= s.faScoreTotal));
  check("faScoreTotal nam trong khoang 0-100", tang1.every((s) => s.faScoreTotal >= 0 && s.faScoreTotal <= 100));

  const tcb = tang1.find((s) => s.ticker === "TCB");
  check("TCB (nhom financial) dung trong so FINANCIAL_SECTOR_WEIGHTS (balanceSheet 0.35)", tcb?.weights.balanceSheetHealth === 0.35);

  const fpt = tang1.find((s) => s.ticker === "FPT");
  check("FPT (nhom thuong) dung trong so DEFAULT_WEIGHTS (balanceSheet 0.25)", fpt?.weights.balanceSheetHealth === 0.25);
}

console.log("\n=== TEST: Tang 2 - Tuong quan vi mo ===");
{
  const eligible = new Set(stockUniverseV2.map((s) => s.ticker));
  const tang1 = computeTang1V2(stockUniverseV2, eligible);
  const tang2 = computeTang2V2(tang1);
  check("Tra ve dung so luong ma", tang2.length === tang1.length);
  check("Ket qua duoc sap xep giam dan theo tang2Score", tang2.every((s, i) => i === 0 || tang2[i - 1].tang2Score >= s.tang2Score));

  const tcb = tang2.find((s) => s.ticker === "TCB");
  check("TCB co correlation am (Ngan hang nguoc DXY) van duoc gan dung gia tri", tcb?.correlation === -0.45);
  check("tang2Score >= tang1Score (vi dung |corr| de cong them, khong tru)", tang2.every((s) => s.tang2Score >= s.tang1Score));
}

console.log("\n=== TEST: Tang 3 - Suc manh nganh ===");
{
  const eligible = new Set(stockUniverseV2.map((s) => s.ticker));
  const tang1 = computeTang1V2(stockUniverseV2, eligible);
  const tang2 = computeTang2V2(tang1);
  const tang3 = computeTang3V2(tang2);
  check("Tra ve dung so luong ma", tang3.length === tang2.length);
  check("Moi ket qua co policyNote (dinh tinh) tach rieng khoi diem so", tang3.every((s) => typeof s.policyNote === "string" && s.policyNote.length > 0));
  check("Ket qua duoc sap xep giam dan theo tang3Score", tang3.every((s, i) => i === 0 || tang3[i - 1].tang3Score >= s.tang3Score));
}

console.log("\n=== TEST: Tang 4 - TA + Dong tien ngoai ===");
{
  const eligible = new Set(stockUniverseV2.map((s) => s.ticker));
  const tang1 = computeTang1V2(stockUniverseV2, eligible);
  const tang2 = computeTang2V2(tang1);
  const tang3 = computeTang3V2(tang2);
  const tang4 = computeTang4V2(tang3, stockUniverseV2);

  const hpg = tang4.find((s) => s.ticker === "HPG");
  check("HPG vi pham MA50 phai co riskFlags chua 'Vi pham MA50'", !!hpg?.riskFlags.some((f) => f.includes("Vi pham MA50")));
  check("HPG bi tru diem nang do MA50 broken (tang4Score < tang3Score)", hpg ? hpg.tang4Score < hpg.tang3Score : false);

  const fpt = tang4.find((s) => s.ticker === "FPT");
  check("FPT room ngoai con 0.8% (<2%) phai co canh bao room ngoai", !!fpt?.riskFlags.some((f) => f.includes("Room ngoai")));

  check("Ket qua duoc sap xep giam dan theo tang4Score", tang4.every((s, i) => i === 0 || tang4[i - 1].tang4Score >= s.tang4Score));
}

console.log("\n=== TEST: Confluence + Kiem soat tap trung nganh ===");
{
  const eligible = new Set(stockUniverseV2.map((s) => s.ticker));
  const tang1 = computeTang1V2(stockUniverseV2, eligible);
  const tang2 = computeTang2V2(tang1);
  const tang3 = computeTang3V2(tang2);
  const tang4 = computeTang4V2(tang3, stockUniverseV2);
  const { ranked, eliteTop10, concentration } = computeConfluenceV2(tang1, tang2, tang3, tang4);

  check("eliteTop10 co toi da 10 ma", eliteTop10.length <= 10);
  check("ranked duoc sap xep giam dan theo finalScore", ranked.every((s, i) => i === 0 || ranked[i - 1].finalScore >= s.finalScore));
  check("Ma xuat hien ca 4 tang co matchCount = 4", ranked.filter((s) => s.matchCount === 4).every((s) => s.confluenceBonus === 20));
  check("concentration tra ve danh sach co field isOverConcentrated", concentration.every((c) => typeof c.isOverConcentrated === "boolean"));

  const bankingCount = eliteTop10.filter((s) => s.sector === "Ngan hang").length;
  const bankingConcentration = concentration.find((c) => c.sector === "Ngan hang");
  if (bankingConcentration) {
    check(`Dem dung so ma Ngan hang trong Elite 10 (thuc te: ${bankingCount})`, bankingConcentration.count === bankingCount);
  }
}

console.log(`\n=== KET QUA: ${passCount} PASS / ${failCount} FAIL ===\n`);
if (failCount > 0) {
  process.exit(1);
}