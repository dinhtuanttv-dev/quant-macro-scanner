import "dotenv/config";
import path from "node:path";
import { defineConfig, env } from "prisma/config";

// LƯU Ý QUAN TRỌNG:
// - Import đúng là từ "prisma/config" (package "prisma"), KHÔNG PHẢI "@prisma/client/config".
//   Đây là nguyên nhân phổ biến nhất của lỗi "Cannot find module '@prisma/client/config'".
// - Trên Windows, luôn dùng path.join(...) thay vì viết chuỗi path cứng với dấu "\",
//   để tránh lỗi resolve path do khác biệt separator giữa PowerShell/cmd và Node.js.
// - File này PHẢI nằm ở project root (cùng cấp với package.json), không đặt trong /prisma.

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    // url ở đây CHỈ dùng cho Prisma CLI (migrate, db push, studio...).
    // Driver adapter trong code app (lib/prisma.ts) đọc DATABASE_URL riêng, độc lập với file này.
    url: env("DATABASE_URL"),
  },
});