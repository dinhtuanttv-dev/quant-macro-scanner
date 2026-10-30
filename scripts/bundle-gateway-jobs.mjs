// Đóng gói job nền nặng (lib/jobs) thành một tệp ESM cho Market Gateway (Railway, Node thuần) — Vercel CPU giai đoạn 2 (30/10/2026).
// Dùng: node scripts/bundle-gateway-jobs.mjs <đường dẫn ra, VD ../gq/global-quanta/backend/src/market/vendor/qmsJobs.mjs>
// Không đưa vào gói:
//   - @/lib/prisma (Neon): thay bằng mô-đun ném lỗi -> chỗ import lười (Confluence của Lọc ngành) đi nhánh dự phòng có sẵn,
//     đúng như khi Neon hết hạn mức.
//   - next/server: chỉ đệm truy vấn dùng after() -> thay bằng after() ném lỗi, đệm tự đi nhánh "ngoài request" có sẵn.
//   - @/lib/supabase/client: Gateway không giữ khoá Supabase -> client ném lỗi, Risk-On (chỉ để hiển thị, ngoài quyết định) đi nhánh
//     trung lập 50 có sẵn — như khi Supabase bị khoá 402.
// Kiểm cuối: trong gói không còn tệp nào của next/*, @prisma/* hay @supabase/*.
import { build } from "esbuild";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2];
if (!out) { console.error("Thiếu đường dẫn ra."); process.exit(1); }

let sha = "unknown";
try { sha = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim(); } catch { /* ngoài git */ }

const STUBS = {
  "no-prisma": 'throw new Error("Prisma/Neon không có trên Market Gateway");',
  "next-server": 'export function after() { throw new Error("Ngoài request Next.js"); }',
  "no-supabase": 'const no = () => { throw new Error("Supabase không có trên Market Gateway"); }; export const createServiceClient = no; export const createBrowserClient = no;',
};
const gatewayStubs = {
  name: "gateway-stubs",
  setup(b) {
    b.onResolve({ filter: /^@\/lib\/prisma$/ }, () => ({ path: "no-prisma", namespace: "stub" }));
    b.onResolve({ filter: /^next\/server$/ }, () => ({ path: "next-server", namespace: "stub" }));
    b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: "no-supabase", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: STUBS[a.path], loader: "js" }));
  },
};

const r = await build({
  entryPoints: [path.join(root, "lib/jobs/index.ts")], bundle: true, format: "esm", platform: "node", target: "node20",
  tsconfig: path.join(root, "tsconfig.json"), write: false, metafile: true, legalComments: "none", logLevel: "warning", plugins: [gatewayStubs],
  banner: { js: `// FILE SINH TỰ ĐỘNG — KHÔNG SỬA TAY. Nguồn: quant-macro-scanner lib/jobs (commit ${sha}). Tạo lại: node scripts/bundle-gateway-jobs.mjs <ra>\nimport { createRequire as __qmsCreateRequire } from "node:module"; const require = __qmsCreateRequire(import.meta.url);` },
});
const inputs = Object.keys(r.metafile.inputs);
const bad = inputs.filter((i) => /node_modules[\\/](next|@prisma|@supabase)[\\/]/.test(i));
if (bad.length) { console.error("Gói kéo theo next/prisma/supabase:", bad.slice(0, 5)); process.exit(1); }
const code = r.outputFiles[0].text;
writeFileSync(out, code);
const deps = [...new Set(inputs.filter((i) => i.includes("node_modules")).map((i) => i.split(/node_modules[\\/]/).pop().split(/[\\/]/).slice(0, 2).join("/")))];
console.log(`${out}: ${(code.length / 1024).toFixed(0)} KB, ${inputs.length} tệp nguồn; gói npm: ${deps.join(", ") || "(không)"}`);
