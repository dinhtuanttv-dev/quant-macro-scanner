import { prisma } from "@/lib/prisma";
async function main() {
  await prisma.impactEdge.deleteMany({ where: { sourceId: { in: (await prisma.catalystSource.findMany({ where: { originRecordId: { not: null } }, select: { id: true } })).map(s => s.id) } } });
  await prisma.catalystSource.deleteMany({ where: { originRecordId: { not: null } } });
  console.log("Da xoa cac catalyst tu tin tuc that (giu nguyen du lieu seed tay)");
}
main().finally(() => prisma.$disconnect());
