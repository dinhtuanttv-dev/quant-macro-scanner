# Timing Engine cổ tức v3 — trạng thái tích hợp (Project A)

Tài liệu này phản ánh code hiện tại của `lib/cotuc/timing-v3/` và các route `/api/cotuc/*` liên quan. Nguồn gốc: gói
`cotuc-timing-engine` (HANDOFF.md của gói). Cập nhật cùng lúc với code — tài liệu lạc hậu là nguyên nhân gây module trùng ở các phiên trước.

## 1. Nguồn dữ liệu (03/10/2026)

| Dữ liệu | Nguồn chính | Dự phòng | Ghi chú |
|---|---|---|---|
| Giá mã | **SSI** qua Market Gateway `GET /api/market/ohlcv/nominal-history` (giá khớp danh nghĩa, kho bền vững) | Yahoo `adjClose` | Không dùng "giá điều chỉnh" của SSI: `ClosePriceAdjusted` chỉ áp hệ số đợt gần nhất cho toàn lịch sử; `RefPrice` không còn điều chỉnh vào ngày GDKHQ từ 2025 (đã đối chiếu bản ghi gốc). |
| VN-Index | **SSI** qua Gateway | VNDirect dchart | |
| Sự kiện quyền (cổ tức tiền mặt, cổ tức CP, thưởng) | **VNDirect finfo** `/v4/events` | VCI events | VCI trả HTTP 403 cả trên production từ 10/2026. |
| Ngày công bố BCTC quý | **VNDirect finfo** `/v4/financial_statements` (`createdDate`, chỉ nhận 1–120 ngày sau cuối quý) | CafeF `event.chn` | Trang CafeF đổi cấu trúc, bộ thu thập không còn đọc được. |
| LNST quý (SUE) | **VNDirect finfo** itemCode `23000` (LNST cổ đông mẹ), `21001` doanh thu | VCI financials | Đối chiếu: VNM 2024 = 9.392 tỷ, VCB 2024 = 33.831 tỷ. |

**Chuỗi giá dùng cho backtest** (`total-return.ts`): giá khớp danh nghĩa SSI × hệ số ở mỗi ngày GDKHQ —
tiền mặt `1 − D·(1−5%)/P_{t−1}` (thuế TNCN 5%, như `price-adjustment.ts`), cổ tức CP/thưởng `1/(1+r)`, ESOP bỏ qua.
Nắm qua GDKHQ đã gồm cổ tức nhận **sau thuế** → `EventSample.netDividendYield = 0`. Các đợt tới 2024 được đối chiếu chéo với
giá tham chiếu của Sở (ghi chú khớp/lệch trong `priceSource.notes`).

## 2. Route

| Route | Dữ liệu | Tính ở đâu |
|---|---|---|
| `GET /api/cotuc/cycle-paths?ticker=` | CAR quanh GDKHQ | trực tiếp (`compute-cycle-io.ts`) |
| `GET /api/cotuc/cycle-stats-v3?ticker=` | Thống kê 5 cửa sổ cổ tức | trực tiếp |
| `GET /api/cotuc/timing-signals` | TimingSignal cả danh mục | đọc `TimingSignalCache` (cron `timing-signals-scan`) |
| `GET /api/cotuc/earnings-cycle-stats?ticker=&quarter=1..4` | `EarningsCycleStatsV3` | đọc `EarningsSeasonalityCache` |
| `GET /api/cotuc/earnings-cycle-paths?ticker=&quarter=1..4` | `CyclePathsV3` quanh ngày công bố | đọc `EarningsSeasonalityCache` |
| `GET /api/cotuc/annual-earnings-calendar?ticker=` | `AnnualEarningsCalendarV3` | đọc `EarningsSeasonalityCache` |
| `GET /api/cotuc/earnings-signals` | EarningsSignal cả danh mục ("Sắp KQKD") — nhắm QUÝ SẮP CÔNG BỐ, SUE/tăng trưởng của kỳ vừa công bố | đọc `EarningsSeasonalityCache` |

404 = chưa có dữ liệu (frontend coi là `null`).

## 3. Cron

- `timing-signals-scan` (22:50): đếm "còn N phiên tới GDKHQ" bằng **lịch nghỉ lễ VN thật** (`vn-holidays.ts`, bản sao của
  global-quanta `src/lib/cotuc/vn-holidays.ts` — sửa phải sửa cả hai; mới có 2026, cập nhật 2027 khi HOSE/HNX công bố).
- `earnings-seasonality-scan` (23:05–23:45, 7 lần): `phase=collect` theo lô 3 mã (giá SSI 10 năm + ngày công bố + CAR quanh ngày
  công bố + EarningsSignal), rồi `phase=finalize` (prior ngành × quý × **cửa sổ**, cần ≥ 3 mã cùng ngành, thiếu thì cả danh mục;
  FDR gộp 4 quý × 4 cửa sổ; Beta-Binomial; lịch công bố Student-t). Kiểm tra `CRON_SECRET` nếu biến này được đặt.
- Bảng `EarningsSeasonalityCache`: tạo một lần bằng `npx tsx create-earnings-seasonality-cache-table.ts` (cùng quy ước
  `create-dividend-event-cache-table.ts`, không dùng `prisma migrate`).

## 4. Mùa vụ KQKD (`seasonality/`)

- Chép từ gói: `beta-binomial.ts`, `announce-date-model.ts`, `compute-earnings-cycle-stats.ts`, `compute-annual-earnings-calendar.ts`,
  `scan-seasonal-opportunities.ts` (+ test gốc của gói trong `__tests__/cotuc-seasonality-*.test.ts`, lần đầu chạy với thư viện thật).
- **Bổ sung** vào `computeFullYearEarningsCycleStats`: tham số tuỳ chọn `priorByWindow` (prior đúng "cùng ngành, cùng quý, cùng cửa sổ";
  không truyền thì giữ hành vi cũ).
- Cửa sổ (`earnings-windows.ts`, gói chỉ có cửa sổ mẫu trong test): E1 −15→−10 thoát −1 (chạy trước), E2 −5→−2 thoát +3 (nắm qua công bố),
  E3 +1→+2 thoát +7, E4 +1→+3 thoát +20 (PEAD). Ngày 0 = phiên giao dịch đầu tiên kể từ ngày công bố.
- Kết quả thật lúc phát hành: mỗi quý ~6–7 kỳ có đủ giá; ngưỡng tối thiểu 8 kỳ của gói nên **chưa cửa sổ nào được chọn**
  (VD PVT Q3 E3: q = 0,03, cận dưới +1,8%, thắng 86% nhưng n = 7). Đây là kết quả hợp lệ, UI hiển thị rõ.

## 5. Chưa làm / giới hạn

- Danh mục quét = `DIVIDEND_STOCKS` (17 mã) như cron hiện có; mã ngoài danh mục -> 404.
- Phân tích chu kỳ cổ tức vẫn dùng 5 năm giá; mùa vụ dùng 10 năm.
- Quyền mua (rights) chưa điều chỉnh (thiếu giá phát hành trong nguồn sự kiện).
- Bộ máy quyết định 3 trạng thái, theo dõi tín hiệu, học trọng số (giai đoạn 4 của gói): PR riêng; học trọng số giữ **CHƯA BẬT**.
