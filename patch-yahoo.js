const fs = require("fs");
const path = "./lib/market-data/yahoo-finance-adapter.ts";
let content = fs.readFileSync(path, "utf8");

const marker = "function toYahooSymbol(ticker: string): string {";
const idx = content.indexOf(marker);
if (idx === -1) {
  console.error("KHONG TIM THAY function toYahooSymbol - can kiem tra lai thu cong.");
  process.exit(1);
}

const endMarker = "\n}";
const endIdx = content.indexOf(endMarker, idx) + endMarker.length;
const oldFn = content.slice(idx, endIdx);

const newFn = `function toYahooSymbol(ticker: string): string {
  const normalized = ticker.trim().toUpperCase();
  if (normalized === "VNINDEX" || normalized === "VN-INDEX") return "^VNINDEX.VN";
  if (ticker.startsWith("^") || ticker.includes(".")) return ticker;
  return \`${"${ticker}"}.VN\`;
}`;

content = content.replace(oldFn, newFn);
fs.writeFileSync(path, content, "utf8");
console.log("DA VA XONG.");
console.log("--- Noi dung ham moi ---");
console.log(newFn);
