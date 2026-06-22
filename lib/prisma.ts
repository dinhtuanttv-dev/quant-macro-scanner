import "dotenv/config";
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma v7: KHÔNG thể new PrismaClient() trực tiếp nữa — bắt buộc phải truyền driver adapter.
// PrismaClient import từ output path đã khai báo trong schema.prisma (./generated/prisma/client),
// KHÔNG import từ "@prisma/client" nữa (package đó không export PrismaClient trực tiếp trong v7).

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

// Singleton pattern — tránh tạo nhiều PrismaClient/connection pool khi Next.js hot-reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}