// S8 (Global Quanta, 06/11/2026) — điểm vào gói "season core" cho Market Gateway: đúng các hàm của Mùa vụ KQKD (nạp giá SSI tổng lợi suất,
// ngày công bố VNDirect, dựng mẫu CAR quanh ngày công bố, prior ngành, thống kê cả năm + lịch) để Gateway tính BẢN THĂM DÒ với ngày làm mốc
// khác (ngày công bố thật từ CafeF). Không thêm thuật toán: chỉ xuất lại hàm sẵn có. Đóng gói: node scripts/bundle-gateway-jobs.mjs <ra> lib/jobs/season-core.ts
export { loadBenchmarkPrices, loadStockPrices } from "@/lib/cotuc/timing-v3/price-source";
export {
  QUARTERS, SEASONALITY_VERSION, buildSeasonalitySamples, fetchAnnounceDates, finalizeTicker,
} from "@/lib/cotuc/timing-v3/seasonality/seasonality-io";
