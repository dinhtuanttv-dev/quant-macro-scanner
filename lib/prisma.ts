import "dotenv/config";

import { PrismaClient } from "./generated/prisma/client";

import { PrismaPg } from "@prisma/adapter-pg";



// Prisma v7: KHÔNG thể new PrismaClient() trực tiếp nữa — bắt buộc phải truyền driver adapter.

// PrismaClient import từ output path đã khai báo trong schema.prisma (./generated/prisma/client),

// KHÔNG import từ "@prisma/client" nữa (package đó không export PrismaClient trực tiếp trong v7).



// FIX GOC RE THAT SU CUOI CUNG (2026-09-26, xac nhan qua TAI LIEU
// CHINH THUC cua Prisma - prisma.io/docs/orm/prisma-client/setup-and-
// configuration/databases-connections/connection-pool): Prisma v7 (v7
// tro len) DUNG driver adapter "pg" cho MOI viec pooling/timeout
// (KHONG con la Prisma tu quan ly nhu v6) - va "pg" driver MAC DINH
// connectionTimeoutMillis: 0 (KHONG GIOI HAN) - khac han v6 cu co san
// connect_timeout=5s/pool_timeout=10s. Neu KHONG set thu cong (nhu
// code truoc day, chi truyen connectionString), 1 ket noi/query co
// the CHO VO THOI HAN THAT SU neu Postgres khong phan hoi - dung
// khop 100% trieu chung da quan sat (treo dung sau buoc "cold start"
// ket noi, khong bao gio hoan thanh tu nhien, du fix singleton
// pattern truoc do dung nhung khong du).
//
// Day la fix CHINH XAC theo dung khuyen nghi CHINH THUC cua Prisma
// (vi du "Matching Prisma ORM v6 defaults" trong docs) - dat lai
// timeout gan giong hanh vi cu, tranh treo vo thoi han.
//
// FIX BO SUNG (2026-09-26, sau khi xac nhan connectionTimeoutMillis
// van khong du - 5 lan test lien tiep van dung dung o ~60-61s, tuc la
// bi VERCEL maxDuration cat, KHONG PHAI Prisma tu bao loi som hon):
// connectionTimeoutMillis CHI gioi han thoi gian LAY 1 connection tu
// pool (neu pool CO SAN connection, lay ngay lap tuc, khong bi gioi
// han nay anh huong). Neu chinh CAU QUERY dang thuc thi tren Postgres
// bi cham/treo (khac voi "khong lay duoc connection"), can THEM
// statement_timeout (Postgres server TU HUY cau query dang chay qua
// lau) va query_timeout (client-side backstop, phong khi server
// ngung phan hoi hoan toan).
const adapter = new PrismaPg({

  connectionString: process.env.DATABASE_URL,

  connectionTimeoutMillis: 10_000,

  idleTimeoutMillis: 30_000,

  statement_timeout: 15_000,

  query_timeout: 20_000,

});



// Singleton pattern — tránh tạo nhiều PrismaClient/connection pool khi Next.js hot-reload.

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };



export const prisma =

  globalForPrisma.prisma ??

  new PrismaClient({

    adapter,

    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],

  });



// FIX GOC RE THAT SU (2026-09-26, xac nhan qua kiem tra thuc te co
// he thong): dieu kien "!== production" cu chi tai su dung ket noi
// TRONG MOI TRUONG PHAT TRIEN (tranh tao nhieu instance khi Next.js
// hot-reload) - o PRODUCTION (Vercel THAT), globalForPrisma.prisma
// KHONG BAO GIO duoc gan, nghia la MOI LAN "cold start" tao 1
// PrismaClient + 1 CONNECTION POOL MOI HOAN TOAN, khong bao gio tai
// su dung. Sau rat nhieu lan goi lien tuc (test debug nhieu lan trong
// ngay, cron chay nhieu lan), co the da tich luy dung het gioi han
// ket noi dong thoi cua Neon (Free tier thuong rat thap), khien query
// moi phai CHO VO THOI HAN (day chinh la nguyen nhan that cua chuoi
// FUNCTION_INVOCATION_TIMEOUT da gap, KHONG PHAI gioi han thoi gian
// cua Vercel plan nhu nghi truoc do - da xac nhan qua debug-sleep
// chay duoc toi 30s binh thuong).
//
// FIX: LUON gan globalForPrisma.prisma (bo dieu kien NODE_ENV) - dam
// bao tai su dung dung 1 PrismaClient/connection pool duy nhat MOI
// KHI CO THE (ca o production, khi serverless function duoc "warm"
// tai su dung container giua cac lan goi lien tiep - rat pho bien
// tren Vercel), thay vi luon tao moi.
globalForPrisma.prisma = prisma;


