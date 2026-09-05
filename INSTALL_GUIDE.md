# HƯỚNG DẪN CÀI ĐẶT — Catalyst Engine Nâng Cấp Toàn Diện
## 3 Giai đoạn: Critical (🔴) → High (🟠) → Medium (🟡)

---

## TÓM TẮT 22 FILE TRONG GÓI NÀY

### File MỚI HOÀN TOÀN (tạo mới, không có bản cũ để đè lên)

```
lib/catalyst/engine/EdgeIndex.ts
lib/catalyst/engine/SectorRegistry.ts
lib/catalyst/engine/computeTrustScore.ts
lib/catalyst/engine/computeCredibilityWeight.ts
lib/catalyst/engine/ScanCircuitBreaker.ts
lib/catalyst/engine/SnapshotStore.ts
lib/catalyst/engine/computeFreshnessScore.ts
lib/catalyst/engine/ScanTimeBudget.ts
lib/catalyst/dedup/isDuplicateByUrl.ts
components/catalyst/TrustScoreBadge.tsx
__tests__/computeCredibilityWeight.test.ts
__tests__/computeTrustScore.test.ts
__tests__/computeFreshnessScore.test.ts
__tests__/EdgeIndex.test.ts
__tests__/SectorRegistry.test.ts
```

### File ĐÈ LÊN BẢN CŨ (ghi đè hoàn toàn, đã tích lũy đủ cả 3 giai đoạn)

```
lib/catalyst/CatalystEngine.ts
lib/catalyst/sourceIngestion.ts
lib/catalyst/newsIngestion.ts
lib/recommendations/cafef-scraper.ts
lib/types/siu-quet-ai.ts
app/api/catalysts/scan/route.ts
app/api/catalysts/latest/route.ts
components/quant/command-center/TradingPlanCard.tsx
```

---

## BƯỚC 1 — SAO LƯU TRƯỚC KHI GHI ĐÈ (bắt buộc)

```powershell
cd C:\Users\HP\quant-macro-scanner
git add .
git commit -m "Backup truoc khi ap dung nang cap Catalyst Engine 3 giai doan"
```

Nếu có lỗi sau khi tích hợp, luôn có thể quay lại bằng `git checkout .` hoặc `git revert`.

---

## BƯỚC 2 — GIẢI NÉN VÀ COPY FILE

1. Giải nén file zip này vào 1 thư mục tạm, ví dụ `C:\Users\HP\Downloads\complete-upgrade\`.
2. Copy **toàn bộ cấu trúc thư mục** từ `complete-upgrade\` đè lên đúng vị trí tương ứng trong `quant-macro-scanner\`:

```powershell
# Chạy từ thư mục quant-macro-scanner, trỏ đường dẫn tới nơi đã giải nén
robocopy "C:\Users\HP\Downloads\complete-upgrade" "C:\Users\HP\quant-macro-scanner" /E
```

Lệnh `robocopy /E` tự động: tạo file mới ở đúng vị trí, ghi đè file trùng tên, giữ nguyên các file khác không có trong gói.

---

## BƯỚC 3 — CÀI ĐẶT VITEST (nếu project chưa có test runner)

Kiểm tra trước:
```powershell
Get-Content package.json | Select-String "vitest|jest"
```

**Nếu không ra dòng nào** (chưa có test runner), cài Vitest:
```powershell
npm install -D vitest @vitejs/plugin-react vite-tsconfig-paths
```

Thêm vào `package.json`, phần `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

Tạo file `vitest.config.ts` ở gốc project (nếu chưa có):
```typescript
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()], // để "@/..." trong test resolve đúng như trong Next.js
  test: {
    environment: "node",
  },
});
```

**Nếu project đã dùng Jest thay vì Vitest:** đổi dòng đầu mỗi file `.test.ts` từ:
```typescript
import { describe, it, expect } from "vitest";
```
thành (Jest có sẵn global, không cần import):
```typescript
// Xoá dòng import trên, Jest tự có describe/it/expect
```

---

## BƯỚC 4 — CHẠY TEST XÁC NHẬN

```powershell
npm test
```

**Kỳ vọng:** 5 file test pass toàn bộ (khoảng 20 test case). Nếu có lỗi `Cannot find module '@/...'`, kiểm tra lại `vitest.config.ts` đã có `tsconfigPaths()` plugin chưa.

---

## BƯỚC 5 — GENERATE PRISMA & BUILD KIỂM TRA

```powershell
npx prisma generate
npm run build
```

**Lỗi thường gặp và cách xử lý:**

| Lỗi | Nguyên nhân | Cách sửa |
|---|---|---|
| `Cannot find module './engine/EdgeIndex'` | Chưa copy đủ file trong `lib/catalyst/engine/` | Kiểm tra lại Bước 2 |
| `Property 'trustScore' does not exist` | Component UI cũ đang destructure `TickerImpactCard` không đầy đủ | Thêm `trustScore` vào phần destructure hoặc dùng spread `{...card}` |
| `scrapeCafefRecommendations(...).length is not a function` | Code cũ gọi hàm này mong đợi mảng, giờ trả về object | Sửa thành `const { records } = await scrapeCafefRecommendations();` |

---

## BƯỚC 6 — CẬP NHẬT 2 FILE CHƯA CÓ TRONG GÓI NÀY (thủ công)

Gói này **không** sửa 2 file sau — cần bạn tự thêm 2 dòng nhỏ để UI thực sự hiển thị các cải tiến mới:

### 6.1. `lib/catalyst/useCatalystData.ts` — thêm field staleness

Tìm interface `CatalystSnapshot`, thêm 2 dòng:
```typescript
export interface CatalystSnapshot {
  // ... các field hiện có, giữ nguyên
  isStale?: boolean;
  ageMinutes?: number | null;
}
```

### 6.2. `components/catalyst/CatalystTab.tsx` — hiển thị cảnh báo dữ liệu cũ

Tìm dòng hiển thị "Quét lần cuối: ...", thêm điều kiện:
```tsx
{isStale && (
  <span style={{ color: "#eab308", fontSize: 11, marginLeft: 8 }}>
    ⚠ Dữ liệu cũ ({ageMinutes} phút trước)
  </span>
)}
```

---

## BƯỚC 7 — SEED LẠI DỮ LIỆU TEST (khuyến nghị, không bắt buộc)

Vì `SectorRegistry` và `SnapshotStore` dùng key Redis mới, kiểm tra nhanh mọi thứ hoạt động:

```powershell
# Ctrl+C nếu dev server đang chạy, rồi:
npm run dev
```

Terminal khác:
```powershell
curl.exe http://localhost:3000/api/catalysts/scan -H "Authorization: Bearer <CRON_SECRET_thật>"
```

**Kỳ vọng:** JSON trả về vẫn có `ok: true` như trước — cấu trúc response public không đổi.

Kiểm tra key Redis mới đã hoạt động:
```powershell
@'
import { Redis } from "@upstash/redis";
import "dotenv/config";
const r = new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! });
r.zrange("catalyst:snapshot:history", -5, -1).then((v) => console.log("Lich su snapshot:", v));
r.hgetall("catalyst:unmapped_sectors").then((v) => console.log("Nganh chua anh xa:", v));
'@ | Set-Content check-phase-upgrade.ts

npx tsx check-phase-upgrade.ts
```

---

## BẢNG TÓM TẮT TOÀN BỘ CẢI TIẾN (tham khảo nhanh)

| # | Mức độ | Vấn đề gốc | Module giải quyết |
|---|---|---|---|
| 1 | 🔴 Critical | Không có indexing, O(n) mỗi lần lookup | `EdgeIndex.ts` |
| 2 | 🔴 Critical | Dedup chỉ dựa heuristic thời gian | `isDuplicateByUrl.ts` |
| 3 | 🔴 Critical | Ánh xạ ngành leak tên tiếng Anh | `SectorRegistry.ts` |
| 4 | 🟠 High | Credibility nhị phân cứng nhắc | `computeCredibilityWeight.ts` |
| 5 | 🟠 High | Không phát hiện bị chặn khi scrape | `ScanCircuitBreaker.ts` |
| 6a | 🟠 High | Snapshot mất hoàn toàn khi TTL hết hạn | `SnapshotStore.ts` (staleness) |
| 6b | 🟠 High | Không có lịch sử snapshot | `SnapshotStore.ts` (history) |
| 7 | 🟡 Medium | `dangerouslySetInnerHTML` không cần thiết | `TradingPlanCard.tsx` |
| 8 | 🟡 Medium | Type `TickerImpactResult` không liên kết `ImpactDirection` | `siu-quet-ai.ts` |
| 9 | 🟡 Medium | Không có test coverage | `__tests__/*.test.ts` (5 file) |
| 10 | 🟡 Medium | Trust Score tính nhưng chưa có UI | `TrustScoreBadge.tsx` |
| 11 | 🟡 Medium | Giới hạn scrape cứng, không thích ứng | `ScanTimeBudget.ts` |
| 12 | 🟡 Medium | "Mới" chỉ là nhị phân, không liên tục | `computeFreshnessScore.ts` |

---

## CÁC TÍNH NĂNG MỚI CHO NGƯỜI DÙNG CUỐI (chưa có UI, engine đã sẵn sàng)

Backend đã tính toán sẵn, cần thêm ~1 buổi để nối UI ở phase tiếp theo:

1. **Instant Impact Search** — `engine.searchTickerImpact(query)` đã sẵn sàng, chỉ cần thêm ô input + gọi API.
2. **Trust Score Badge** — component đã có (`TrustScoreBadge.tsx`), cần chèn vào `SectorRadarView.tsx`/`TopMoversBoard.tsx` nơi hiển thị mỗi card, truyền `card.trustScore` và `trustScoreLabel(card.trustScore)`.
3. **Freshness Score liên tục** — `sector.freshnessScore` (0-1) đã có trong `SectorRanking`, có thể dùng để điều chỉnh độ sáng hiệu ứng "MỚI" thay vì on/off.
4. **Admin panel ngành chưa ánh xạ** — `getUnmappedSectors()` đã sẵn sàng, cần 1 trang admin đơn giản hiển thị + nút "Đã xử lý" gọi `clearResolvedFromQuarantine()`.

---

*Tài liệu này đi kèm bộ code Phase 1+2+3. Nếu gặp lỗi khi tích hợp, giữ nguyên thông báo lỗi đầy đủ để tra cứu nhanh hơn.*
