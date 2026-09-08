// lib/domestic-events/gemini-monitor/vn30-review-watcher.ts
// Dung Gemini API + Google Search grounding de PHAT HIEN thoi diem HOSE
// CHINH THUC cong bo ngay ra soat VN30 ky tiep theo - KHONG tu doan ngay,
// CHI ghi nhan khi tim thay nguon that (hsx.vn hoac bao tai chinh dua tin
// da xay ra, khong phai "du bao"/"nhan dinh" cua cong ty chung khoan).
import { GoogleGenAI } from "@google/genai";

export interface Vn30ReviewFinding {
  found: boolean;
  announcementDate: string | null; // ngay HOSE cong bo (da xay ra)
  effectiveDate: string | null; // ngay co hieu luc
  sourceUrl: string | null;
  sourceName: string | null;
  rawAnswer: string;
}

const SYSTEM_PROMPT = `Ban la mot cong cu tra cuu THONG TIN CHINH XAC, khong phai co van dau tu.
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

export async function checkVn30ReviewAnnouncement(): Promise<Vn30ReviewFinding> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { found: false, announcementDate: null, effectiveDate: null, sourceUrl: null, sourceName: null, rawAnswer: "Thieu GEMINI_API_KEY" };
  }

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: "gemini-flash-latest",
    contents: SYSTEM_PROMPT,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const text = response.text ?? "";

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { found: false, announcementDate: null, effectiveDate: null, sourceUrl: null, sourceName: null, rawAnswer: text };

    const parsed = JSON.parse(jsonMatch[0]);

    // Kiem tra bat buoc: PHAI co sourceUrl that thi moi chap nhan found: true.
    // Day la lop phong ve quan trong nhat - khong tin tuong hoan toan vao
    // truong "found" cua chinh Gemini tra ve, tu kiem tra lai dieu kien.
    if (parsed.found && (!parsed.sourceUrl || typeof parsed.sourceUrl !== "string" || !parsed.sourceUrl.startsWith("http"))) {
      return { found: false, announcementDate: null, effectiveDate: null, sourceUrl: null, sourceName: null, rawAnswer: text };
    }

    return {
      found: !!parsed.found,
      announcementDate: parsed.announcementDate ?? null,
      effectiveDate: parsed.effectiveDate ?? null,
      sourceUrl: parsed.sourceUrl ?? null,
      sourceName: parsed.sourceName ?? null,
      rawAnswer: text,
    };
  } catch (err) {
    console.error("[vn30-review-watcher] Loi parse JSON tu Gemini:", err);
    return { found: false, announcementDate: null, effectiveDate: null, sourceUrl: null, sourceName: null, rawAnswer: text };
  }
}


