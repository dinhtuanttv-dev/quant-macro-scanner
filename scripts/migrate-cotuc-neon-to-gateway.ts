// B2 (25/10/2026) — chuyển dữ liệu Cổ tức CŨ từ Neon sang kho Cổ tức trên Gateway, chạy MỘT LẦN sau khi Neon mở lại (hết hạn mức).
//   npx tsx scripts/migrate-cotuc-neon-to-gateway.ts            (xem trước, không ghi)
//   npx tsx scripts/migrate-cotuc-neon-to-gateway.ts --write    (ghi)
// Quy tắc KHÔNG ĐÈ dữ liệu mới: decision / timing / season chỉ nhập mã CHƯA có trên Gateway (Gateway đã tính lại từ nguồn);
// track (sổ theo dõi tín hiệu — không tính lại được) nhập mọi id chưa có, id trùng thì giữ bản đã có kết quả / ghi kết quả muộn hơn;
// cycle (lịch sử GDKHQ) và sectortrack (Lọc ngành) nhập dòng chưa có. Cần DATABASE_URL (Neon) + CRON_SECRET + MARKET_GATEWAY_URL trong môi trường.
import { prisma } from "@/lib/prisma";
import { storeList, storeUpsert, type CotucTable } from "@/lib/cotuc/store/gateway-store";

const WRITE = process.argv.includes("--write");

async function have(table: CotucTable, key: string): Promise<Map<string, Record<string, unknown>>> {
  const rows = await storeList<Record<string, unknown>>(table, { fields: table === "track" || table === "sectortrack" ? ["id", "outcome", "outcomeRecordedAt"] : table === "cycle" ? ["ticker", "exDate"] : [key] });
  return new Map(rows.map((r) => [table === "cycle" ? `${r.ticker}:${String(r.exDate).slice(0, 10)}` : String(r[key]), r]));
}

async function main() {
  const report: Record<string, { neon: number; gateway: number; toImport: number }> = {};
  const plan: [CotucTable, Record<string, unknown>[]][] = [];

  const add = async (table: CotucTable, key: string, neonRows: Record<string, unknown>[], keep: (n: Record<string, unknown>, g: Record<string, unknown> | undefined) => boolean, keyOf = (r: Record<string, unknown>) => String(r[key])) => {
    const g = await have(table, key);
    const rows = neonRows.filter((r) => keep(r, g.get(keyOf(r))));
    report[table] = { neon: neonRows.length, gateway: g.size, toImport: rows.length };
    plan.push([table, rows]);
  };

  await add("decision", "ticker", await prisma.cotucDecisionState.findMany(), (_n, g) => !g);
  await add("timing", "ticker", await prisma.timingSignalCache.findMany(), (_n, g) => !g);
  await add("season", "ticker", await prisma.earningsSeasonalityCache.findMany(), (_n, g) => !g);
  await add("track", "id", (await prisma.cotucSignalTrack.findMany()).map((r) => ({ ...r, outcome: r.outcome })), (n, g) => {
    if (!g) return true;
    if (g.outcome == null && n.outcome != null) return true; // Neon có kết quả, Gateway chưa
    return false;
  });
  // MV0: sổ theo dõi tín hiệu ngành (Lọc ngành) — bảng có thể chưa từng được tạo trên Neon.
  const sectorRows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "SectorSignalTrack"`).catch(() => []);
  await add("sectortrack", "id", sectorRows, (n, g) => !g || (g.outcome == null && n.outcome != null));
  await add("cycle", "id", (await prisma.dividendCycleWindow.findMany()).map(({ id: _id, ...r }) => r), (_n, g) => !g,
    (r) => `${r.ticker}:${(r.exDate as Date).toISOString().slice(0, 10)}`);

  console.table(report);
  if (!WRITE) { console.log("Xem trước — thêm --write để ghi."); return; }
  for (const [table, rows] of plan) if (rows.length) console.log(table, "ghi", await storeUpsert(table, rows));
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
