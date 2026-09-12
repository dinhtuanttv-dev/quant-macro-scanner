// Dividend Lifecycle - chuan hoa 5 moc thoi gian THAT tu VCI (dieu chinh
// tu 6 moc ly thuyet ban dau xuong 5 moc THUC TE, vi VCI khong tach rieng
// "Nghi quyet HDQT" khoi "Cong bo GDKHQ chinh thuc" - ca 2 dung chung 1
// truong publicDate, da xac nhan bang du lieu that).
//
// QUAN TRONG: eventCode "ISS" gom 3 LOAI KHAC NHAU ve ban chat kinh te
// (da xac nhan qua debug 17 ma that):
//   - "Tra Co tuc bang Co phieu" (VD HPG 10%, TCB 50%, ACB 13%) -> qua
//     that cho co dong
//   - "Co phieu thuong" (VD FPT 10%, DPM 73.7%, GAS 3%, VCB 12.8%) -> qua
//     tu quy, cung la loi ich co dong
//   - "Phat hanh cho CBCNV" / ESOP (VD MWG, VCI, GMD, NLG, REE) -> KHONG
//     PHAI qua co dong, la phat hanh them cho nhan vien (pha loang) - CAN
//     PHAN BIET RO trong UI, du cong thuc dieu chinh gia ky thuat tren
//     san GIONG HET 2 loai tren.

export type DividendEventType = "CASH" | "STOCK_DIVIDEND" | "BONUS_ISSUE" | "ESOP";

export interface DividendLifecycleEvent {
  ticker: string;
  eventType: DividendEventType;
  eventTitleVi: string;
  // 5 moc THUC TE (dieu chinh tu 6 moc ly thuyet):
  publicDate: string | null;    // Moc 1+3 gop: Cong bo (Nghi quyet + lich GDKHQ)
  agmDate: string | null;       // Moc 2 (TUY CHON): DHDCD gan nhat truoc publicDate, suy luan heuristic
  exrightDate: string | null;   // Moc 4: GDKHQ (Ex-date)
  recordDate: string | null;    // Moc 5: Ngay dang ky cuoi cung
  settlementDate: string | null;// Moc 6: Ve tai khoan (payoutDate voi tien mat, listingDate voi co phieu)
  valuePerShare: number | null; // VND/CP - chi co voi CASH
  exerciseRatio: number | null; // ty le CP thuong/ESOP (VD 0.1 = 10%) - chi co voi STOCK_DIVIDEND/BONUS_ISSUE/ESOP
}

/** Phan loai eventCode "ISS" thanh 3 loai dua theo eventTitleVi (da xac
 * nhan tu du lieu that). Fallback ve BONUS_ISSUE neu khong ro (an toan
 * hon ESOP vi da so ISS thuc te la thuong/co tuc CP, khong phai ESOP). */
export function classifyIssEvent(eventTitleVi: string): DividendEventType {
  const t = eventTitleVi.toLowerCase();
  if (t.includes("cổ tức bằng cổ phiếu")) return "STOCK_DIVIDEND";
  if (t.includes("cbcnv")) return "ESOP";
  if (t.includes("cổ phiếu thưởng")) return "BONUS_ISSUE";
  return "BONUS_ISSUE";
}

/**
 * Ghep cac raw event (DIV/ISS/AGM da fetch tu VCI) thanh danh sach
 * DividendLifecycleEvent chuan hoa. AGM duoc gan theo heuristic: DHDCD
 * GAN NHAT TRUOC publicDate cua su kien DIV/ISS (trong vong 6 thang) -
 * CO THE KHONG CHINH XAC 100% (VN khong luon co 1-1 giua DHDCD va tung
 * dot chia), ghi chu ro trong ket qua tra ve.
 */
export function buildLifecycleEvents(
  ticker: string,
  rawEvents: any[]
): DividendLifecycleEvent[] {
  const agmEvents = rawEvents.filter((e) => ["AGME", "AGMR", "EGME"].includes(e.eventCode));

  function findNearestAgmBefore(publicDate: string | null): string | null {
    if (!publicDate) return null;
    const targetTime = new Date(publicDate).getTime();
    const SIX_MONTHS_MS = 183 * 24 * 60 * 60 * 1000;
    let best: { date: string; diff: number } | null = null;
    for (const agm of agmEvents) {
      const agmDateStr = agm.issueDate ?? agm.exrightDate ?? null;
      if (!agmDateStr) continue;
      const agmTime = new Date(agmDateStr).getTime();
      const diff = targetTime - agmTime;
      if (diff >= 0 && diff <= SIX_MONTHS_MS) {
        if (!best || diff < best.diff) best = { date: agmDateStr, diff };
      }
    }
    return best?.date ?? null;
  }

  const divAndIssEvents = rawEvents.filter((e) => e.eventCode === "DIV" || e.eventCode === "ISS");

  return divAndIssEvents.map((e): DividendLifecycleEvent => {
    const eventType: DividendEventType =
      e.eventCode === "DIV" ? "CASH" : classifyIssEvent(e.eventTitleVi ?? "");

    const publicDate = e.publicDate ?? null;
    const settlementDate = e.payoutDate ?? e.listingDate ?? null;

    return {
      ticker,
      eventType,
      eventTitleVi: e.eventTitleVi ?? "",
      publicDate,
      agmDate: findNearestAgmBefore(publicDate),
      exrightDate: e.exrightDate ?? null,
      recordDate: e.recordDate ?? null,
      settlementDate,
      valuePerShare: eventType === "CASH" ? (e.valuePerShare ?? null) : null,
      exerciseRatio: eventType !== "CASH" ? (e.exerciseRatio ?? null) : null,
    };
  });
}
