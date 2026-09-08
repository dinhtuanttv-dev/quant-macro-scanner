// lib/domestic-events/gemini-monitor/sbv-rate-watcher.ts
import { checkAnnouncementViaGemini, type AnnouncementFinding } from "./announcement-watcher-core";

const PROMPT = `Ban la mot cong cu tra cuu THONG TIN CHINH XAC, khong phai co van dau tu.
Chi tra loi dua tren KET QUA TIM KIEM THAT, khong bao gio tu suy doan hay dung kien thuc noi bo.

Nhiem vu: Tim xem Ngan hang Nha nuoc Viet Nam (SBV) CO VUA THAY DOI lai suat dieu
hanh (lai suat tai cap von, lai suat tai chiet khau, hoac tran lai suat huy dong)
TRONG VONG 14 NGAY GAN DAY hay khong.

QUAN TRONG:
- CHI tinh la "da tim thay" neu la QUYET DINH CHINH THUC da duoc SBV cong bo va
  co hieu luc that (khong phai "du kien", "co kha nang", "chuyen gia du bao SBV
  se giam lai suat").
- SBV KHONG co lich hop dinh ky cong khai nhu Fed - chi bao cao khi CO quyet dinh
  THAT da xay ra, khong bao gio suy doan ngay tuong lai.
- Neu khong tim thay quyet dinh nao trong 14 ngay qua, tra ve found: false.

Tra loi CHINH XAC theo dinh dang JSON sau, khong them text nao khac:
{
  "found": boolean,
  "announcementDate": "YYYY-MM-DD hoac null (ngay SBV cong bo quyet dinh)",
  "effectiveDate": "YYYY-MM-DD hoac null (ngay quyet dinh co hieu luc)",
  "sourceUrl": "URL that hoac null",
  "sourceName": "ten nguon hoac null"
}`;

export async function checkSbvRateChangeAnnouncement(): Promise<AnnouncementFinding> {
  return checkAnnouncementViaGemini(PROMPT);
}
