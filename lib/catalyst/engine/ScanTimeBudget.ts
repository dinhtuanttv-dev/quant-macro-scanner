// lib/catalyst/engine/ScanTimeBudget.ts
//
// M5 - THAY THE GIOI HAN CUNG (MAX_REPORTS_PER_SCAN=30) BANG NGAN SACH THOI GIAN
// THICH UNG.
//
// Van de goc: cafef-scraper.ts dung so dem co dinh (toi da 30 report/lan quet),
// khong kiem tra THOI GIAN THUC TE da troi qua. Neu mang cham hon binh thuong
// (vd CafeF phan hoi cham do tai cao), 30 request x delay co the VUOT gioi han
// maxDuration=10s cua Vercel Hobby truoc khi kip xong, khien toan bo request bi
// Vercel FORCE KILL giua chung - mat het du lieu da scrape duoc (khong kip ghi
// vao DB), te hon ca viec chu dong dung som voi du lieu it hon.
//
// Giai phap: theo doi thoi gian da troi qua TU LUC BAT DAU, dung vong lap truoc
// khi cham nguong an toan (maxDuration - safetyMargin), KHONG phu thuoc so dem
// co dinh nua. MAX_REPORTS_PER_SCAN van giu lai lam TRAN TREN bo sung (phong khi
// mang qua nhanh, khong nen scrape vo han trong 1 lan), nhung dieu kien dung
// THUC TE la thoi gian, khong phai so luong.

export class ScanTimeBudget {
  private readonly startedAt: number;

  constructor(
    private readonly maxDurationMs: number,
    private readonly safetyMarginMs: number = 1500 // du phong 1.5s cho phan xu ly con lai sau vong lap (ghi DB, tra response...)
  ) {
    this.startedAt = Date.now();
  }

  public hasTimeRemaining(): boolean {
    return this.elapsedMs() < this.maxDurationMs - this.safetyMarginMs;
  }

  public elapsedMs(): number {
    return Date.now() - this.startedAt;
  }

  public remainingMs(): number {
    return Math.max(0, this.maxDurationMs - this.safetyMarginMs - this.elapsedMs());
  }

  // Uoc tinh con kip bao nhieu vong lap nua, dua tren thoi gian trung binh/vong
  // da do duoc tu cac lan truoc - dung de quyet dinh co nen bat dau vong moi khong
  // thay vi bat dau roi bi cat giua chung.
  public canAffordNextIteration(estimatedIterationMs: number): boolean {
    return this.remainingMs() >= estimatedIterationMs;
  }
}
