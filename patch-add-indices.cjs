const fs = require("fs");
const path = "./lib/market-data/vndirect-adapter.ts";
let content = fs.readFileSync(path, "utf8");

const addition = `
export interface IndexQuote {
  symbol: string;
  close: number;
  changeAbs: number;
  changePct: number;
}

/**
 * Lay gia dong cua + % thay doi cho nhieu chi so cung luc, dung
 * chung nguon VNDirect dchart da xac nhan hoat dong tot cho VNINDEX.
 * Symbol dung: VNINDEX, VN30, HNX, UPCOM.
 */
export async function fetchIndicesLatest(symbols: string[]): Promise<Record<string, IndexQuote | null>> {
  const result: Record<string, IndexQuote | null> = {};

  await Promise.all(
    symbols.map(async (symbol) => {
      const vndSymbol = symbol === "VNINDEX" ? "VNINDEX" : symbol;
      const res = await fetchIndexOhlcvHistory(vndSymbol, 5);
      if (!res.success || !res.data || res.data.length < 2) {
        result[symbol] = null;
        return;
      }
      const bars = res.data;
      const last = bars[bars.length - 1];
      const prev = bars[bars.length - 2];
      const changeAbs = last.close - prev.close;
      const changePct = prev.close !== 0 ? (changeAbs / prev.close) * 100 : 0;
      result[symbol] = { symbol, close: last.close, changeAbs, changePct };
    })
  );

  return result;
}
`;

fs.writeFileSync(path, content + addition, "utf8");
console.log("DA THEM fetchIndicesLatest vao vndirect-adapter.");
