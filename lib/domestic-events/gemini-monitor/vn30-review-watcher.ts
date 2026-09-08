// lib/domestic-events/gemini-monitor/vn30-review-watcher.ts
import { checkAnnouncementViaGemini, type AnnouncementFinding } from "./announcement-watcher-core";

const PROMPT = `Ban la mot cong cu tra cuu THONG TIN CHINH XAC, khong phai co van dau tu.
Chi tra loi dua tren KET QUA TIM KIEM THAT, khong bao gio tu suy doan hay dung kien thuc noi bo.

Nhiem vu: Tim xem So Giao dich Chung khoan TP.HCM (HOSE) DA CHINH THUC CONG BO
ngay ra soat danh muc chi so VN30 ky tiep theo (du kien khoang thang 1/2027) hay chua.

QUAN TRONG:
- CHI tinh la "da tim thay" neu la THONG BAO CHINH THUC tu HOSE (hsx.vn) hoac tin tuc
  bao chi dua tin HOSE DA CONG BO (khong phai "du bao", "nhan dinh", "uoc tinh" cua
  cong ty chung khoan).
- Neu chi tim thay cac bai "du bao"/"nhan dinh" (vi du cua SSI, BSC, MBS...) ve viec
  ma nao co the vao/ra rổ, do KHONG PHAI la cong bo chinh thuc - tra ve found: false.
- Neu khong tim thay gi, tra ve found: false, khong duoc bia du lieu.

Tra loi CHINH XAC theo dinh dang JSON sau, khong them text nao khac:
{
  "found": boolean,
  "announcementDate": "YYYY-MM-DD hoac null",
  "effectiveDate": "YYYY-MM-DD hoac null",
  "sourceUrl": "URL that hoac null",
  "sourceName": "ten nguon hoac null"
}`;

export async function checkVn30ReviewAnnouncement(): Promise<AnnouncementFinding> {
  return checkAnnouncementViaGemini(PROMPT);
}
