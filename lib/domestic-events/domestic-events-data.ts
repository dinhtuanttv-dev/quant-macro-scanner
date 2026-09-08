// lib/domestic-events/domestic-events-data.ts
// Su kien CO CAU THI TRUONG trong nuoc THAT, co nguon chinh thuc xac thuc.
// KHONG bia ngay nang hang/review index chua chinh thuc cong bo - day la
// thong tin nhay cam, sai la anh huong quyet dinh dau tu that.
//
// Nguyen tac: chi them su kien khi co nguon CHINH THUC (co quan phat hanh
// quyet dinh, khong phai du bao/don doan cua cong ty chung khoan).

export interface DomesticEventStage {
  label: string;
  date: string | null; // ISO date, null neu chua co ngay cu the
}

export interface DomesticEvent {
  id: string;
  tag: "NANG_HANG_THI_TRUONG" | "KY_REVIEW_CHI_SO" | "ROOM_NGOAI" | "IPO_NIEM_YET" | "CHINH_SACH";
  title: string;
  stages: DomesticEventStage[];
  activeStageIndex: number;
  effectiveDate: string; // ISO date - ngay co hieu luc chinh, dung de tinh dem nguoc
  sourceUrl: string;
  sourceName: string;
  note: string;
}

export const DOMESTIC_EVENTS: DomesticEvent[] = [
  {
    id: "ftse-russell-upgrade-2026",
    tag: "NANG_HANG_THI_TRUONG",
    title: "FTSE Russell nang hang Viet Nam len Thi truong moi noi thu cap",
    stages: [
      { label: "Dua vao watchlist (2018)", date: "2018-09-01" },
      { label: "Xac nhan nang hang", date: "2026-04-07" },
      { label: "Danh gia bo sung (thang 3)", date: "2026-03-01" },
      { label: "Chinh thuc hieu luc", date: "2026-09-21" },
    ],
    activeStageIndex: 3,
    effectiveDate: "2026-09-21",
    sourceUrl: "https://www.lseg.com/en/media-centre/press-releases/ftse-russell/2026/ftse-russell-announces-results-march-2026-semi-annual-country-classification-review-equities-fixed-income",
    sourceName: "LSEG (cong ty me FTSE Russell) - Thong cao bao chi chinh thuc",
    note: "Du bao dong von thu dong ~1.5 ty USD, chia lam 4 dot tu 9/2026 den 9/2027. Danh sach ma co phieu cu the duoc dua vao chi so se do chinh FTSE Russell cong bo gan ngay hieu luc - KHONG du doan truoc de tranh sai lech.",
  },
];

export function getDomesticEventsWithCountdown(now: Date = new Date()) {
  return DOMESTIC_EVENTS.map((ev) => {
    const effective = new Date(ev.effectiveDate + "T00:00:00Z");
    const daysUntil = Math.round((effective.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return { ...ev, daysUntil, isPast: daysUntil < 0 };
  });
}
