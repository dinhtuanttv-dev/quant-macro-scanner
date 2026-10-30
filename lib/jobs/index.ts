// Job nền nặng của Project A chạy trên Market Gateway (Railway) — 30/10/2026, Vercel CPU giai đoạn 2.
// Gateway đóng gói tệp này (esbuild) thành backend/src/market/vendor/qmsJobs.mjs và gọi trực tiếp trong tiến trình,
// thay vì gọi HTTP tới /api/cron/* trên Vercel (mỗi lô tốn tới 300 giây Fluid Active CPU).
export { runTimingSignalsScan } from "./timing-signals-scan";
export { runEarningsSeasonalityScan, type SeasonalityPhase } from "./earnings-seasonality-scan";
export { runSectorTimingScan } from "./sector-timing-scan";
export { runCatalystScan } from "./catalyst-scan";
export type { JobResult } from "./job-result";
