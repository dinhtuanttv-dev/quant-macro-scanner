const fs = require("fs");
const path = "./lib/market-data/ssi-adapter.ts";
let content = fs.readFileSync(path, "utf8");

const oldHeaders = `headers: { "User-Agent": "Mozilla/5.0 (compatible; QuantMacroScanner/1.0)" },`;
const newHeaders = `headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://iboard.ssi.com.vn/",
        Origin: "https://iboard.ssi.com.vn",
        Accept: "application/json, text/plain, */*",
      },`;

if (!content.includes(oldHeaders)) {
  console.error("KHONG TIM THAY doan headers cu - can kiem tra thu cong.");
  process.exit(1);
}

content = content.replace(oldHeaders, newHeaders);
fs.writeFileSync(path, content, "utf8");
console.log("DA VA XONG headers.");
