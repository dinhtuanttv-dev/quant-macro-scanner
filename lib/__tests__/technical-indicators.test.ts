// ============================================================
// UNIT TEST cho technical-indicators.ts
// Chay doc lap: npx tsx lib/__tests__/technical-indicators.test.ts
// Khong can goi network - day la test cho ham THUAN (pure function).
// ============================================================

import {
  calculateSMA, percentVsMA, classifyMa50Status, calculateRelativeStrength,
  calculateVolumeSpikeRatio, extractCloses,
} from "../market-data/technical-indicators";
import type { OhlcvBar } from "../market-data/tcbs-adapter";

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

console.log("\n=== TEST: calculateSMA ===");
{
  const closes = [10, 20, 30, 40, 50];
  check("SMA(5) cua [10,20,30,40,50] = 30", calculateSMA(closes, 5) === 30);
  check("SMA(3) cua [10,20,30,40,50] = trung binh 3 phan tu cuoi (40)", calculateSMA(closes, 3) === 40);
  check("SMA tra ve null khi khong du du lieu (period > length)", calculateSMA(closes, 10) === null);
}

console.log("\n=== TEST: percentVsMA ===");
{
  const closesAbove = [100, 100, 100, 100, 110]; // gia cuoi 110, MA5 = 102
  const pct = percentVsMA(closesAbove, 5);
  check("Gia tren MA tra ve % duong", pct !== null && pct > 0);

  const closesBelow = [100, 100, 100, 100, 90];
  const pctBelow = percentVsMA(closesBelow, 5);
  check("Gia duoi MA tra ve % am", pctBelow !== null && pctBelow < 0);
}

console.log("\n=== TEST: classifyMa50Status ===");
{
  const safeCloses = Array(51).fill(100);
  safeCloses[50] = 105; // gia hien tai cao hon MA50
  check("Gia tren MA50 -> status safe", classifyMa50Status(safeCloses) === "safe");

  const warningCloses = Array(51).fill(100);
  warningCloses[50] = 98.5; // lech -1.5%, trong khoang warning
  check("Gia duoi MA50 nhe (-1.5%) -> status warning", classifyMa50Status(warningCloses) === "warning");

  const brokenCloses = Array(51).fill(100);
  brokenCloses[50] = 90; // lech -10%, vuot nguong broken
  check("Gia duoi MA50 manh (-10%) -> status broken", classifyMa50Status(brokenCloses) === "broken");

  const insufficientData = [100, 101, 102];
  check("Khong du du lieu (< 50 phien) -> mac dinh safe, khong ket luan tieu cuc", classifyMa50Status(insufficientData) === "safe");
}

console.log("\n=== TEST: calculateRelativeStrength ===");
{
  // Co phieu tang 10%, benchmark tang 5% trong 10 ngay -> RS = +5
  const stockCloses = Array(11).fill(100);
  stockCloses[10] = 110;
  const benchCloses = Array(11).fill(1000);
  benchCloses[10] = 1050;

  const rs = calculateRelativeStrength(stockCloses, benchCloses, 10);
  check("RS = 5.0 khi CP tang 10% va benchmark tang 5% trong 10 ngay", rs === 5);

  const insufficientRs = calculateRelativeStrength([100, 101], [1000, 1010], 10);
  check("RS tra ve null khi khong du du lieu cho periodDays", insufficientRs === null);
}

console.log("\n=== TEST: calculateVolumeSpikeRatio ===");
{
  const makeBars = (volumes: number[]): OhlcvBar[] =>
    volumes.map((v, i) => ({ date: `2026-01-${i + 1}`, open: 10, high: 11, low: 9, close: 10, volume: v }));

  const normalVolumes = Array(20).fill(1000);
  const barsWithSpike = makeBars([...normalVolumes, 2500]); // phien cuoi gap 2.5x trung binh
  const ratio = calculateVolumeSpikeRatio(barsWithSpike, 20);
  check("Volume spike ratio = 2.5 khi phien cuoi gap 2.5x trung binh 20 phien", ratio === 2.5);

  const insufficientBars = makeBars([1000, 1100, 1200]);
  check("Tra ve null khi khong du du lieu (< avgPeriod + 1 phien)", calculateVolumeSpikeRatio(insufficientBars, 20) === null);
}

console.log("\n=== TEST: extractCloses ===");
{
  const bars: OhlcvBar[] = [
    { date: "2026-01-01", open: 10, high: 11, low: 9, close: 10.5, volume: 1000 },
    { date: "2026-01-02", open: 10.5, high: 12, low: 10, close: 11.2, volume: 1200 },
  ];
  const closes = extractCloses(bars);
  check("extractCloses tra ve dung mang gia dong cua theo thu tu", closes[0] === 10.5 && closes[1] === 11.2);
}

console.log(`\n=== KET QUA: ${passCount} PASS / ${failCount} FAIL ===\n`);
if (failCount > 0) {
  process.exit(1);
}