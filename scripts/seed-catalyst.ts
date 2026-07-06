// scripts/seed-catalyst.ts
// Bản mở rộng: thêm cascade bậc 2 (VGC), cặp xung đột (VCB), để phô diễn đủ badge của Tab.
// Chạy: npx tsx scripts/seed-catalyst.ts
// LƯU Ý: chạy lại nhiều lần sẽ tạo trùng dữ liệu (script này không xoá dữ liệu cũ trước khi seed).

import { prisma } from "@/lib/prisma"; // đổi đúng đường dẫn nếu khác

async function main() {
  // ---- Nguồn 1: Thép trúng thầu — sinh cascade bậc 2 ----
  const source1 = await prisma.catalystSource.create({
    data: {
      title: "Tap doan thep trung goi thau ha tang 2,000 ty dong",
      category: "contract",
      sourceCredibility: "confirmed",
      publishedDate: new Date(Date.now() - 1.5 * 24 * 3600 * 1000),
      corroborationCount: 1,
    },
  });

  await prisma.impactEdge.createMany({
    data: [
      {
        sourceId: source1.id,
        targetType: "sector",
        targetId: "Thep",
        direction: "benefit",
        propagationDistance: "direct",
        hopCount: 1,
        baseWeight: 9,
        decayRate: 0.12,
        horizon: "medium",
      },
      {
        sourceId: source1.id,
        targetType: "ticker",
        targetId: "HPG",
        direction: "benefit",
        propagationDistance: "direct",
        hopCount: 1,
        baseWeight: 9,
        decayRate: 0.12,
        horizon: "medium",
      },
      {
        sourceId: source1.id,
        targetType: "ticker",
        targetId: "NKG",
        direction: "benefit",
        propagationDistance: "competitor",
        hopCount: 1,
        baseWeight: 6,
        decayRate: 0.15,
        horizon: "medium",
      },
      // Cascade bậc 2: nhu cầu vật liệu xây dựng tăng theo hạ tầng
      {
        sourceId: source1.id,
        targetType: "ticker",
        targetId: "VGC",
        direction: "benefit",
        propagationDistance: "downstream",
        hopCount: 2,
        baseWeight: 4,
        decayRate: 0.1,
        horizon: "medium",
      },
    ],
  });

  // ---- Nguồn 2: Luật Đất đai — có lịch thực thi (scheduled) ----
  const source2 = await prisma.catalystSource.create({
    data: {
      title: "Luat Dat dai sua doi co hieu luc tu thang sau",
      category: "regulatory",
      sourceCredibility: "confirmed",
      publishedDate: new Date(Date.now() - 20 * 24 * 3600 * 1000),
      executionDate: new Date(Date.now() + 12 * 24 * 3600 * 1000),
      corroborationCount: 3,
    },
  });

  await prisma.impactEdge.createMany({
    data: [
      {
        sourceId: source2.id,
        targetType: "sector",
        targetId: "Bat dong san",
        direction: "harm",
        propagationDistance: "direct",
        hopCount: 1,
        baseWeight: 8,
        decayRate: 0.1,
        horizon: "long",
      },
      {
        sourceId: source2.id,
        targetType: "ticker",
        targetId: "NVL",
        direction: "harm",
        propagationDistance: "direct",
        hopCount: 1,
        baseWeight: 8,
        decayRate: 0.1,
        horizon: "long",
      },
    ],
  });

  // ---- Nguồn 3 + 4: tạo tín hiệu XUNG ĐỘT trên cùng 1 mã VCB ----
  const source3 = await prisma.catalystSource.create({
    data: {
      title: "NHNN giu nguyen lai suat dieu hanh, ho tro thanh khoan he thong",
      category: "macro",
      sourceCredibility: "confirmed",
      publishedDate: new Date(Date.now() - 1 * 24 * 3600 * 1000),
      corroborationCount: 2,
    },
  });

  await prisma.impactEdge.create({
    data: {
      sourceId: source3.id,
      targetType: "ticker",
      targetId: "VCB",
      direction: "benefit",
      propagationDistance: "direct",
      hopCount: 1,
      baseWeight: 5,
      decayRate: 0.2,
      horizon: "short",
    },
  });

  const source4 = await prisma.catalystSource.create({
    data: {
      title: "Thong tu moi siet room tin dung nhom ngan hang quoc doanh",
      category: "regulatory",
      sourceCredibility: "confirmed",
      publishedDate: new Date(Date.now() - 0.5 * 24 * 3600 * 1000),
      corroborationCount: 2,
    },
  });

  await prisma.impactEdge.create({
    data: {
      sourceId: source4.id,
      targetType: "ticker",
      targetId: "VCB",
      direction: "harm",
      propagationDistance: "direct",
      hopCount: 1,
      baseWeight: 4,
      decayRate: 0.15,
      horizon: "short",
    },
  });

  console.log("Seed xong:", {
    source1: source1.id,
    source2: source2.id,
    source3: source3.id,
    source4: source4.id,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());