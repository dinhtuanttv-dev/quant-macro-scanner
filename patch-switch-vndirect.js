const fs = require("fs");
const path = "./app/api/ohlcv/route.ts";
let content = fs.readFileSync(path, "utf8");
content = content.replace(
  `import { fetchIndexOhlcvHistory } from "@/lib/market-data/ssi-adapter";`,
  `import { fetchIndexOhlcvHistory } from "@/lib/market-data/vndirect-adapter";`
);
fs.writeFileSync(path, content, "utf8");
console.log("DA CHUYEN SANG VNDIRECT ADAPTER.");
