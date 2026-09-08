// lib/domestic-events/gemini-monitor/announcement-watcher-core.ts
// Logic dung CHUNG cho moi loai giam sat thong bao qua Gemini + Google Search.
// Nguyen tac bat buoc: CHI tra ve found=true khi co sourceUrl THAT - tu kiem
// tra lai o tang nay, khong tin tuong hoan toan vao truong "found" cua chinh
// Gemini tra ve (phong ngua ao giac).
import { GoogleGenAI } from "@google/genai";

export interface AnnouncementFinding {
  found: boolean;
  announcementDate: string | null;
  effectiveDate: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  rawAnswer: string;
}

export async function checkAnnouncementViaGemini(systemPrompt: string): Promise<AnnouncementFinding> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { found: false, announcementDate: null, effectiveDate: null, sourceUrl: null, sourceName: null, rawAnswer: "Thieu GEMINI_API_KEY" };
  }

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: "gemini-flash-latest",
    contents: systemPrompt,
    config: { tools: [{ googleSearch: {} }] },
  });

  const text = response.text ?? "";

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { found: false, announcementDate: null, effectiveDate: null, sourceUrl: null, sourceName: null, rawAnswer: text };

    const parsed = JSON.parse(jsonMatch[0]);

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
    console.error("[announcement-watcher-core] Loi parse JSON tu Gemini:", err);
    return { found: false, announcementDate: null, effectiveDate: null, sourceUrl: null, sourceName: null, rawAnswer: text };
  }
}
