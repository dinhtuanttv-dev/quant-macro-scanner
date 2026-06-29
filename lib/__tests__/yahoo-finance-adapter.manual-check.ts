// ============================================================
// SCRIPT KIEM TRA KET NOI THAT toi Yahoo Finance (khong phai unit test)
// Day goi network THAT, du lieu se khac nhau moi lan chay.
// Chay: npx tsx lib/__tests__/yahoo-finance-adapter.manual-check.ts
// ============================================================

import { fetchOhlcvHistory, fetchLatestCloseBatch } from "../market-data/yahoo-finance-adapter";
import { extractCloses, calculateSMA, classifyMa50Status } from "../market-data/technical-indicators";

async function main() {
  console.log("\n=== KIEM TRA 1: Lay lich su 3 thang cho FPT.VN ===");
  const fptResult = await fetchOhlcvHistory("FPT", "3mo");

  if (!fptResult.success) {
    console.error(`  LOI: ${fptResult.error}`);
    console.error("  -> Co the Yahoo doi cau truc, hoac ma FPT.VN khong ton tai tren Yahoo.");
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

  console.log("\n=== KIEM TRA 3: Lay chi so VN-Index ===");
  const vnindexResult = await fetchOhlcvHistory("^VNINDEX.VN", "1mo");
  if (vnindexResult.success && vnindexResult.data && vnindexResult.data.length > 0) {
    const latest = vnindexResult.data[vnindexResult.data.length - 1];
    console.log(`  VN-Index gan nhat (${latest.date}): ${latest.close}`);
  } else {
    console.warn(`  CANH BAO: khong lay duoc VN-Index. Loi: ${vnindexResult.error}`);
  }

  console.log("\n=== KIEM TRA 4: Lay gia dong cua hang loat (FPT, VCB, HPG) ===");
  const batch = await fetchLatestCloseBatch(["FPT", "VCB", "HPG"]);
  console.log("  Ket qua:", JSON.stringify(batch, null, 2));

  const anyFailed = Object.values(batch).some((v) => v === null);
  if (anyFailed) {
    console.warn("\n  CANH BAO: it nhat 1 ma khong lay duoc gia. Kiem tra ky hon.");
  } else {
    console.log("\n  Tat ca ma deu lay duoc gia thanh cong.");
  }

  console.log("\n=== HOAN TAT KIEM TRA KET NOI YAHOO FINANCE ===\n");
}

main().catch((err) => {
  console.error("Loi khong mong doi:", err);
  process.exit(1);
});