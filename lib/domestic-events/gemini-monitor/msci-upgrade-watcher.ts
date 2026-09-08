// lib/domestic-events/gemini-monitor/msci-upgrade-watcher.ts
import { checkAnnouncementViaGemini, type AnnouncementFinding } from "./announcement-watcher-core";

const PROMPT = `Ban la mot cong cu tra cuu THONG TIN CHINH XAC, khong phai co van dau tu.
Chi tra loi dua tren KET QUA TIM KIEM THAT, khong bao gio tu suy doan hay dung kien thuc noi bo.

Nhiem vu: Tim xem MSCI (nha cung cap chi so) DA CHINH THUC CONG BO quyet dinh
nang hang thi truong chung khoan Viet Nam (tu Frontier Market len Emerging Market)
hay chua. Luu y: FTSE Russell da xac nhan nang hang rieng (hieu luc 21/9/2026) -
day la thong bao KHAC, tu MSCI, chua co ngay cu the.

QUAN TRONG:
- CHI tinh la "da tim thay" neu la THONG BAO CHINH THUC tu chinh MSCI (msci.com,
  thong cao bao chi chinh thuc) hoac bao chi uy tin dua tin MSCI DA CONG BO
  (khong phai "ky vong", "du bao", "co the" cua nha phan tich).
- Neu chi la du bao/nhan dinh chua chinh thuc, tra ve found: false.
- Neu khong tim thay gi, tra ve found: false, khong duoc bia du lieu.

Tra loi CHINH XAC theo dinh dang JSON sau, khong them text nao khac:
{
  "found": boolean,
  "announcementDate": "YYYY-MM-DD hoac null",
  "effectiveDate": "YYYY-MM-DD hoac null",
  "sourceUrl": "URL that hoac null",
  "sourceName": "ten nguon hoac null"
}`;

export async function checkMsciUpgradeAnnouncement(): Promise<AnnouncementFinding> {
  return checkAnnouncementViaGemini(PROMPT);
}
