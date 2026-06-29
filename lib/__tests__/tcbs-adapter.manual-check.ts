// ============================================================
// SCRIPT KIEM TRA KET NOI THAT toi TCBS (khong phai unit test)
// Day goi network THAT, du lieu se khac nhau moi lan chay.
// Chay: npx tsx lib/__tests__/tcbs-adapter.manual-check.ts
// ============================================================

import { fetchOhlcvHistory, fetchLatestCloseBatch } from "../market-data/tcbs-adapter";
import { extractCloses, calculateSMA, classifyMa50Status } from "../market-data/technical-indicators";

async function main() {
  console.log("\n=== KIEM TRA 1: Lay lich su 90 ngay cho FPT ===");
  const fptResult = await fetchOhlcvHistory("FPT", 90);

  if (!fptResult.success) {
    console.error(`  LOI: ${fptResult.error}`);
    console.error("  -> TCBS API co the da doi cau truc, hoac mang co van de.");
    console.error("  -> Kiem tra lai endpoint trong lib/market-data/tcbs-adapter.ts");
    process.exit(1);
  }

  const bars = fptResult.data!;
  console.log(`  Thanh cong: nhan duoc ${bars.length} phien giao dich.`);
  if (bars.length > 0) {
    console.log(`  Phien gan nhat: ${bars[bars.length - 1].date}, gia dong cua: ${bars[bars.length - 1].close}`);
    console.log(`  Phien dau tien: ${bars[0].date}, gia dong cua: ${bars[0].close}`);
  }

  console.log("\n=== KIEM TRA 2: Tinh chi bao ky thuat tu du lieu thuc ===");
  const closes = extractCloses(bars);
  const ma50 = calculateSMA(closes, 50);
  const status = classifyMa50Status(closes);
  console.log(`  MA50 cua FPT: ${ma50 ?? "khong du du lieu"}`);
  console.log(`  Trang thai MA50: ${status}`);

  console.log("\n=== KIEM TRA 3: Lay gia dong cua hang loat (FPT, VCB, HPG) ===");
  const batch = await fetchLatestCloseBatch(["FPT", "VCB", "HPG"]);
  console.log("  Ket qua:", JSON.stringify(batch, null, 2));

  const anyFailed = Object.values(batch).some((v) => v === null);
  if (anyFailed) {
    console.warn("\n  CANH BAO: it nhat 1 ma khong lay duoc gia. Kiem tra ky hon.");
  } else {
    console.log("\n  Tat ca ma deu lay duoc gia thanh cong.");
  }

  console.log("\n=== HOAN TAT KIEM TRA KET NOI TCBS ===\n");
}

main().catch((err) => {
  console.error("Loi khong mong doi:", err);
  process.exit(1);
});