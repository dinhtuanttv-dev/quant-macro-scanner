// D3 (2026-10-20) — Prisma client extension nối đệm truy vấn (query-cache.ts) vào MỌI thao tác Prisma của ứng dụng.
// Tách riêng để kiểm tra tích hợp trên Prisma thật (PGlite) dùng đúng mã chạy production.
import { Prisma } from "../generated/prisma/client";
import { READ_OPS, WRITE_OPS, type createQueryCache } from "./query-cache";

type QueryCache = ReturnType<typeof createQueryCache>;

// DDL "CREATE … IF NOT EXISTS" (cron sector-timing-scan) không đổi dữ liệu -> không vô hiệu hoá đệm.
export const DDL_IDEMPOTENT = /^\s*CREATE\s+(UNIQUE\s+)?(TABLE|INDEX)\s+IF\s+NOT\s+EXISTS\b/i;

type RawArgs = { strings?: readonly string[]; values?: readonly unknown[]; sql?: string } | readonly unknown[];
const rawKey = (args: unknown) => {
  const a = args as RawArgs;
  return Array.isArray(a) ? a : { s: (a as { strings?: readonly string[] }).strings ?? (a as { sql?: string }).sql, v: (a as { values?: readonly unknown[] }).values };
};
const rawText = (args: unknown) => {
  const a = args as RawArgs;
  if (Array.isArray(a)) return String(a[0] ?? "");
  const o = a as { sql?: string; strings?: readonly string[] };
  return o.sql ?? o.strings?.join("?") ?? "";
};

export function queryCacheExtension(qc: QueryCache) {
  return Prisma.defineExtension({
    name: "query-cache",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (READ_OPS.has(operation)) return qc.read(qc.depsOf(model), { m: model, o: operation, a: args }, () => query(args));
          if (WRITE_OPS.has(operation)) return qc.write([...qc.depsOf(model), qc.ANY], () => query(args));
          return query(args);
        },
      },
      async $queryRaw({ args, query }) {
        return qc.read([qc.ANY], { raw: rawKey(args) }, () => query(args));
      },
      async $queryRawUnsafe({ args, query }) {
        return qc.read([qc.ANY], { rawu: rawKey(args) }, () => query(args));
      },
      async $executeRaw({ args, query }) {
        if (DDL_IDEMPOTENT.test(rawText(args))) return query(args);
        return qc.write([qc.RAW, qc.ANY], () => query(args));
      },
      async $executeRawUnsafe({ args, query }) {
        if (DDL_IDEMPOTENT.test(rawText(args))) return query(args);
        return qc.write([qc.RAW, qc.ANY], () => query(args));
      },
    },
  });
}
