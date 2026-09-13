import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { GoogleGenAI } from "@google/genai";

// SIEU QUET AI - GIAI DOAN 3: Discovery qua Gemini + Google Search
// Grounding (module da co san trong du an: gemini-monitor, da xac nhan
// dung dung SDK @google/genai + model gemini-flash-latest). Chay 3
// LAN/NGAY (8h/13h/20h gio VN = 1h/6h/13h UTC) - CHI 1 REQUEST/LAN de
// tiet kiem quota toi da (tong he thong chi 20 req/ngay, chia se voi AI
// Pros/Cons Tab Co Tuc).
//
// NGUYEN TAC CHONG AO GIAC (ke thua tu announcement-watcher-core.ts):
// CHI tao candidate khi Gemini tra ve sourceUrl THAT (bat dau bang
// http) - khong tin tuong hoan toan vao "found" cua chinh Gemini.
//
// FALLBACK AN TOAN: neu Gemini loi (vd het quota 429), ghi log va tra
// ve rong - KHONG lam hong pipeline, KHONG tao su kien gia.
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const DISCOVERY_PROMPT = `Ban la tro ly tim kiem tin tuc tai chinh Viet Nam. Hay tim 1 SU KIEN VI MO HOAC NGANH quan trong, MOI (trong 24h qua), co the anh huong den thi truong chung khoan Viet Nam (VD: thay doi lai suat SBV, chinh sach tien te, ty gia, xuat nhap khau, gia hang hoa, ket qua kinh doanh nganh lon, nang hang MSCI/FTSE, thay doi ro VN30...).

TRA VE DUY NHAT 1 JSON (khong them chu nao khac, khong dung markdown code block):
{
  "found": true hoac false,
  "title": "tieu de ngan gon su kien",
  "category": "monetary_policy" hoac "geopolitical" hoac "earnings" hoac "upgrade" hoac "other",
  "sectors": ["ten nganh 1", "ten nganh 2"],
  "magnitude": "high" hoac "medium" hoac "low" - muc do quan trong cua su kien,
  "direction": "positive" hoac "negative" - tac dong TICH CUC hay TIEU CUC den cac nganh lien quan,
  "sourceUrl": "URL THAT tu ket qua tim kiem - BAT BUOC neu found=true",
  "sourceName": "ten nguon tin",
  "announcementDate": "YYYY-MM-DD hoac null",
  "aiSummary": "tom tat 1-2 cau vi sao su kien nay dang chu y voi nha dau tu"
}

Neu KHONG tim thay su kien nao du thong tin hoac du nguon, tra ve {"found": false}.`;

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Thiếu GEMINI_API_KEY", created: 0 }, { status: 200 });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: DISCOVERY_PROMPT,
      config: { tools: [{ googleSearch: {} }] },
    });

    const text = response.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ discovered: false, reason: "Không parse được JSON từ Gemini", created: 0 });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Chong ao giac: BAT BUOC co sourceUrl THAT
    if (!parsed.found || !parsed.sourceUrl || typeof parsed.sourceUrl !== "string" || !parsed.sourceUrl.startsWith("http")) {
      return NextResponse.json({ discovered: false, reason: "Không tìm thấy sự kiện có nguồn thật", created: 0 });
    }

    const candidate = await prisma.sieuQuetEventCandidate.create({
      data: {
        rawTitle: parsed.title ?? "Sự kiện chưa rõ tiêu đề",
        category: parsed.category ?? "other",
        sectors: Array.isArray(parsed.sectors) ? parsed.sectors : [],
        magnitude: ["high", "medium", "low"].includes(parsed.magnitude) ? parsed.magnitude : "medium",
        direction: ["positive", "negative"].includes(parsed.direction) ? parsed.direction : "positive",
        sourceUrl: parsed.sourceUrl,
        sourceName: parsed.sourceName ?? null,
        announcementDate: parsed.announcementDate ?? null,
        aiSummary: parsed.aiSummary ?? "",
      },
    });

    return NextResponse.json({ discovered: true, candidateId: candidate.id, created: 1 });
  } catch (err) {
    // FALLBACK AN TOAN: loi Gemini (vd het quota) khong lam hong pipeline
    console.error("[cron/sieu-quet-event-discover] Lỗi (bỏ qua lần này):", err);
    return NextResponse.json({ discovered: false, reason: "Lỗi gọi Gemini, bỏ qua lần này", created: 0 });
  }
}
