// ============================================================
// SCRIPT THU NGHIEM: kiem tra endpoint quoteSummary (EPS/PE/ROE)
// co hoat dong cho ma VN ma KHONG can cookie/crumb hay khong.
// Day la THU NGHIEM, chua phai code chinh thuc.
// Chay: npx tsx lib/__tests__/yahoo-quotesummary.experiment.ts
// ============================================================

async function testQuoteSummary(ticker: string) {
  const symbol = ticker.includes(".") ? ticker : `${ticker}.VN`;
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=defaultKeyStatistics,financialData,summaryDetail`;

  console.log(`\n--- Thu nghiem voi ${symbol} ---`);
  console.log(`URL: ${url}`);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
    });

    console.log(`HTTP Status: ${res.status}`);

    const text = await res.text();

    if (!res.ok) {
      console.log(`Body (loi): ${text.slice(0, 500)}`);
      return;
    }

    const json = JSON.parse(text);
    const result = json?.quoteSummary?.result?.[0];

    if (!result) {
      console.log("Khong co result trong response. Toan bo JSON:");
      console.log(JSON.stringify(json, null, 2).slice(0, 1000));
      return;
    }

    console.log("THANH CONG - cac truong tim duoc:");
    console.log("  trailingPE:", result.summaryDetail?.trailingPE?.raw ?? "khong co");
    console.log("  forwardPE:", result.summaryDetail?.forwardPE?.raw ?? "khong co");
    console.log("  trailingEps:", result.defaultKeyStatistics?.trailingEps?.raw ?? "khong co");
    console.log("  returnOnEquity (ROE):", result.financialData?.returnOnEquity?.raw ?? "khong co");
    console.log("  priceToBook:", result.defaultKeyStatistics?.priceToBook?.raw ?? "khong co");
  } catch (err) {
    console.error("Loi:", err instanceof Error ? err.message : String(err));
  }
}

async function main() {
  await testQuoteSummary("FPT");
  await new Promise((r) => setTimeout(r, 500));
  await testQuoteSummary("VCB");
  await new Promise((r) => setTimeout(r, 500));
  // So sanh: thu them 1 ma My de biet endpoint co hoat dong dung khong
  await testQuoteSummary("AAPL");
}

main();