import { prisma } from "@/lib/prisma";
async function main() {
  const bad = await prisma.catalystSource.findMany({ where: { category: "rating" } });
  const ids = bad.map(s => s.id);
  await prisma.impactEdge.deleteMany({ where: { sourceId: { in: ids } } });
  await prisma.catalystSource.deleteMany({ where: { id: { in: ids } } });
  console.log("Da xoa", ids.length, "ban ghi rating cu");
}
main().finally(() => prisma.$disconnect());
