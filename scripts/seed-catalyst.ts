// scripts/seed-catalyst.ts
import { prisma } from "@/lib/prisma"; // TODO: đổi đúng đường dẫn nếu khác

async function main() {
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
    ],
  });

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

  console.log("Seed xong:", { source1: source1.id, source2: source2.id });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());