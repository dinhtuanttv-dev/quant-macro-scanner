// lib/ingestion/hnx/ticker-sector-lookup.ts
// Bang tra cuu NGANH RIENG cho cac ma khong nam trong stockUniverse (VD ma
// UPCoM nho xuat hien trong tin HNX). KHONG dung chung voi stockUniverse -
// stockUniverse phuc vu Tang 1 FA Score (can du lieu tai chinh that: epsGrowth,
// faScore), con bang nay CHI de gan dung nganh cho hien thi, khong bia diem so.
//
// Them dan khi gap ma moi tu tin HNX chua co trong danh sach. Nguon phan nganh:
// tra cuu thu cong tu website chinh thuc cong ty hoac HNX/CBIS khi can, KHONG bia.
export const UPCOM_TICKER_SECTOR: Record<string, string> = {
  VXB: "Vat lieu xay dung",
};
