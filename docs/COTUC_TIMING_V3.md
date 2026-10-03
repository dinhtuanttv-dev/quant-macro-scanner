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

| `GET /api/cotuc/seasonal-opportunities` | Cơ hội mùa vụ đã đạt kiểm định (xếp theo cận dưới CI) + ứng viên gần đạt kèm điều kiện còn thiếu | đọc `EarningsSeasonalityCache` |

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

## Giai đoạn 4 — Bộ máy quyết định 3 trạng thái + theo dõi tín hiệu (2026-10)

**Nơi tính:** cron `timing-signals-scan` (22:50 UTC hằng ngày) — dùng lại giá SSI đã tải cho TimingSignalCache, tính thêm
`DecisionSnapshot` cho từng mã → bảng `CotucDecisionState`; theo dõi thực tế → bảng `CotucSignalTrack`.
Tạo bảng 1 lần: `npx tsx create-cotuc-decision-tables.ts` (raw `CREATE TABLE IF NOT EXISTS`).

**Route chỉ đọc:**
- `GET /api/cotuc/decision-states[?ticker=]` → `{ asOf, count, states: DecisionSnapshot[] }` (404 khi mã chưa có).
- `GET /api/cotuc/signal-tracking` → `{ summary: TrackingSummary, recent: TrackRow[] (30 mới nhất) }`.

**Ngày GDKHQ dùng cho quyết định** (`resolveUpcomingExDate`): đợt cổ tức tiền mặt đã thông báo trên VNDirect (≥ hôm nay)
= CONFIRMED; chưa có thì ước tính = đợt cuối + trung vị khoảng cách chi (≥ 3 đợt), cuộn tới phiên giao dịch ≥ hôm nay
= ESTIMATED (điều kiện "ngày đã xác nhận" ✖ ⇒ tối đa WATCH). Sửa lỗi cũ: TimingSignalCache trước đây tính action từ
GDKHQ QUÁ KHỨ (mọi mã POST_EX) và không cập nhật `generatedAt`.

**Module** (`lib/cotuc/timing-v3/decision/`): `market-regime`, `log-odds-combiner`, `entry-refinement`,
`compute-decision-state`, `signal-tracking-log` copy nguyên từ gói (kèm test của gói); `optimize-dividend-timing`
port từ global-quanta `src/lib/quant-cotuc.ts` (đổi một nơi phải đổi cả hai); `build-decision` ghép; `tracking` ghi/chấm.

**Tín hiệu thành phần (combineLogOdds, trọng số × hệ số chế độ thị trường 1 / 0,85 / 0,55):**
- Cổ tức: trung bình hậu nghiệm Beta của tỷ lệ thắng cửa sổ đã chọn, prior liên mã cùng cửa sổ (leave-one-out,
  `estimatePriorFromRates`, ≥ 5 mã) — KHÔNG dùng `0,5 + r×5` của README. Trọng số = số đợt.
- Mùa vụ KQKD: P(phản ứng dương) của quý sắp công bố, CHỈ khi ngày công bố dự kiến rơi trước điểm thoát và quý đó có
  cửa sổ đạt kiểm định. Trọng số = số kỳ.
- Thị trường: `classifyMarketRegime` trên VN-Index SSI (MA200 + phân vị biến động 252 phiên).
- Giá chạy trước: CAR đợt hiện tại (gốc = offset −75) so phân vị lịch sử tại offset gần nhất (≥ 5 đợt).
- Thanh khoản: GTGD bình quân 20 phiên (giá khớp SSI × KL) ≥ 5 tỷ đồng.
- Chưa có: mức vô hiệu hoá ATR (chuỗi SSI chỉ có giá đóng cửa) — check chỉ xét "hết thời gian".

**Theo dõi:** ghi 1 bản ghi khi mã vào vùng mua (IN_WINDOW) với FAVORABLE/WATCH (không trùng khi còn bản ghi mở
hoặc trong 120 ngày). Kết quả khi đã có giá tới ngày thoát: CAR thực từ ngày ghi tới ngày thoát > 0 ⇒ 1.
Tóm tắt dùng `signal-tracking-log` của gói: tỷ lệ đúng 20 gần nhất, Brier, CUSUM hai phía (k 0,05, h 5) nhắm xác suất
trung bình đã báo. **learnSignalWeights và calibration KHÔNG bật** — cần vài quý kết quả thật (≥ 30 bản ghi).

## Mở rộng danh mục ~300 mã + quét liên tục (2026-10)

- **Danh mục** (`lib/cotuc/cotuc-universe.ts`): đúng danh mục Siêu Quét AI — Market Gateway `/api/market/scanner/universe`
  (281 mã ngày 03/10/2026), 17 mã cổ tức gốc luôn đứng đầu, phần còn lại theo GTGD giảm dần (thứ tự ổn định cho offset/limit).
  Gateway lỗi → 17 mã gốc. Dùng ở: `timing-signals-scan`, `earnings-seasonality-scan`, `/api/cotuc/events`, `dividend-events-scan`.
- **Sự kiện quyền = VNDirect** cho toàn bộ luồng cũ: `fetchDividendEvents` / `fetchDividendEventsBatch` (vci-events-adapter.ts)
  lấy VNDirect trước (một lượt cho cả danh mục, `fetchVndEventsVciShapeBulk`, ~2 giây / 281 mã) rồi mới tới VCI; dữ liệu đổi
  về đúng định dạng VCI (`vndEventsToVciShape`) nên `/api/cotuc/events`, `DividendEventCache`, `buildLifecycleEvents` và giao diện
  không đổi hợp đồng. `/api/cotuc/events` có `Cache-Control: s-maxage=300`.
- **Lịch sử GDKHQ cho backtest**: VNDirect (cổ tức tiền đã qua) cho MỌI mã; `DividendCycleWindow` chỉ còn dự phòng. Backtest
  10 năm (`CYCLE_YEARS`, SSI từ 10/2016) thay vì 5 năm.
- **Giá trong phiên** (`timing-v3/intraday.ts`): mỗi lượt quét thêm phiên hôm nay từ Gateway `/quotes` + `/indices/VNINDEX` vào
  chuỗi dùng cho ảnh chụp quyết định (CAR hiện tại, chế độ thị trường). Chấm kết quả theo dõi vẫn dùng giá đóng cửa.
- **Cron theo lô**: `timing-signals-scan?offset&limit` (mặc định 25, tối đa 60) và `earnings-seasonality-scan?phase=collect&offset&limit`
  (mặc định 3, tối đa 10) trả `nextOffset` — Market Gateway gọi xoay vòng liên tục (xem global-quanta `docs/MARKET_DATA_GATEWAY.md`).
  Prior Beta liên mã đọc thêm `snapshot.backtest` đã lưu của các mã khác nên không phụ thuộc cách chia lô. Mã chưa từng chi cổ tức
  tiền vẫn có dòng `NO_DATE` trong TimingSignalCache.
- **Cửa sổ sau GDKHQ (W4/W5)**: đợt vừa qua còn hiệu lực tới điểm thoát (trước đây luôn bị coi là POST_EX).
- **Cột KQKD của Screener**: `/api/cotuc/timing-signals` trả `earnings` (tăng trưởng LNST/doanh thu, giới hạn ±150%) + `dateStatus`.
- **Lịch nghỉ TỰ TÍNH, không nạp tay** (`timing-v3/vn-trading-calendar.ts`, bản sao giống hệt ở global-quanta; gốc JS ở Market
  Gateway `tradingCalendar/`): âm lịch Việt Nam (+7) → Tết, Giỗ Tổ; quy tắc Bộ luật Lao động (Tết = 5 ngày thường gần mùng 2;
  lễ rơi cuối tuần nghỉ bù; 02/09 + 1 ngày liền kề từ 2021). Kiểm chứng 10 năm phiên VN-Index thật: khớp 106/106 ngày, không
  đánh nhầm ngày nào. Ngày nghỉ nối do Chính phủ đổi ngày làm việc lấy từ Gateway `/api/market/trading-calendar` (quan sát
  phiên thật + `MARKET_HOLIDAYS`) — `refreshVnHolidayCalendar()` mỗi lượt cron, lỗi thì dùng quy tắc.
