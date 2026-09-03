const fs = require("fs");
const path = "./lib/market-data/yahoo-finance-adapter.ts";
let content = fs.readFileSync(path, "utf8");

const addition = `
export interface YahooQuote {
  price: number | null;
  change: number | null;
  changePct: number | null;
  previousClose: number | null;
  error?: string;
}

export async function fetchQuote(ticker: string): Promise<YahooQuote> {
  try {
    const symbol = toYahooSymbol(ticker);
    const url = \`\${YAHOO_BASE_URL}/\${encodeURIComponent(symbol)}?interval=1d&range=1d\`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return { price: null, change: null, changePct: null, previousClose: null, error: \`HTTP \${res.status}\` };
    }
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) {
      return { price: null, change: null, changePct: null, previousClose: null, error: "Khong co du lieu" };
    }
    const price = meta.regularMarketPrice ?? null;
    const previousClose = meta.previousClose ?? meta.chartPreviousClose ?? null;
    const change = price !== null && previousClose !== null ? price - previousClose : null;
    const changePct = change !== null && previousClose ? (change / previousClose) * 100 : null;
    return { price, change, changePct, previousClose };
  } catch (err) {
    return { price: null, change: null, changePct: null, previousClose: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function fetchQuoteBatch(tickers: string[]): Promise<Record<string, YahooQuote>> {
  const result: Record<string, YahooQuote> = {};
  const BATCH_SIZE = 15;
  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map((t) => fetchQuote(t)));
    batch.forEach((ticker, idx) => { result[ticker] = batchResults[idx]; });
  }
  return result;
}
`;

fs.writeFileSync(path, content + addition, "utf8");
console.log("DA THEM fetchQuote/fetchQuoteBatch vao adapter.");
