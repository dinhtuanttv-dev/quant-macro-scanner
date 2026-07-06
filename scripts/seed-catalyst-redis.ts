// scripts/seed-catalyst-redis.ts
// Seed dữ liệu phụ trợ nằm ở Redis: watchlist cá nhân + tỷ lệ thắng lịch sử.
// Chạy: npx tsx scripts/seed-catalyst-redis.ts
// Dùng đúng biến KV_REST_API_URL/TOKEN (không phải UPSTASH_REDIS_REST_*).

import { Redis } from "@upstash/redis";
import "dotenv/config";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

async function main() {
  // Watchlist cá nhân — HPG và VCB sẽ được đánh dấu nổi bật (viền xanh lam + sao) trong Tab
  await redis.set("catalyst:watchlist", ["HPG", "VCB"]);

  // Tỷ lệ thắng lịch sử theo category + propagationDistance — nếu không có dòng nào khớp,
  // engine tự trả về 50% (trung lập).
  await redis.set("catalyst:calibration", [
    { category: "contract", propagationDistance: "direct", historicalWinRate: 74 },
    { category: "contract", propagationDistance: "competitor", historicalWinRate: 52 },
    { category: "contract", propagationDistance: "downstream", historicalWinRate: 45 },
    { category: "regulatory", propagationDistance: "direct", historicalWinRate: 38 },
    { category: "macro", propagationDistance: "direct", historicalWinRate: 61 },
  ]);

  console.log("Seed Redis xong: watchlist + calibration");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});