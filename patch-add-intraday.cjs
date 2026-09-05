const fs = require("fs");
const path = "./lib/market-data/vndirect-adapter.ts";
let content = fs.readFileSync(path, "utf8");

const addition = `
export interface IntradayBar {
  timestamp: number;
  close: number;
  volume: number;
}

/**
 * Lay du lieu intraday (theo phut) cho VNINDEX, dung de tinh thanh
 * khoan luy ke den mot gio cu the (vd 10:30) cho nhieu phien gan day.
 * resolution: "15" (15 phut) la du chi tiet, giam tai request.
 */
export async function fetchIntradayBars(
  symbol: string,
  daysBack: number = 10,
  resolution: string = "15"
): Promise<IntradayBar[]> {
  const to = Math.floor(Date.now() / 1000);
  const from = to - daysBack * 24 * 60 * 60;
  const url = \`\${VND_BASE_URL}?resource=stock&symbol=\${encodeURIComponent(symbol)}&resolution=\${resolution}&from=\${from}&to=\${to}\`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    cache: "no-store",
  });
  if (!res.ok) return [];

  const json = await res.json();
  if (json?.s !== "ok" || !Array.isArray(json?.t)) return [];

  return json.t.map((ts: number, i: number) => ({
    timestamp: ts,
    close: json.c[i],
    volume: json.v[i],
  }));
}
`;

fs.writeFileSync(path, content + addition, "utf8");
console.log("DA THEM fetchIntradayBars vao vndirect-adapter.");
