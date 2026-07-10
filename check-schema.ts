import { prisma } from "@/lib/prisma";
async function main() {
  const cols = await prisma.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_name = 'CatalystSource' AND column_name IN ('sourceUrl','targetPrice')`);
  console.log("Cot moi tren CatalystSource:", cols);
  const table = await prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_name = 'SourceReference'`);
  console.log("Bang SourceReference:", table);
}
main().finally(() => prisma.$disconnect());
