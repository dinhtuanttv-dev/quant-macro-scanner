// Elite 10 - Muc A/B (Tech Spec v2) Giai doan 2/4: Multi-Agent Debate
// THAT - CA Bull VA Bear Agent DEU dung Gemini (theo yeu cau cap nhat
// 2026-09-24 - khong dung Claude nua vi van de tai khoan Anthropic).
//
// MINH BACH QUAN TRONG: day la "self-consistency debate" (CUNG 1
// provider AI, 2 VAI TRO KHAC NHAU qua system prompt khac nhau), KHONG
// PHAI "true multi-model debate" nhu thiet ke ban dau (Claude vs
// Gemini) - vi CHI CON 1 kien truc model, khong con da dang goc nhin
// tu 2 provider khac nhau. Field "isSingleProviderDebate: true" duoc
// tra ve o response de UI/nguoi dung biet ro dieu nay, khong ngo nhan
// day la 2 AI doc lap thuc su.
//
// NGUYEN TAC BAT BUOC (giong moi Agent khac trong du an): CHI duoc lap
// luan tu DU LIEU DINH LUONG duoc cung cap trong prompt - TUYET DOI
// KHONG bia them tin tuc/su kien/so lieu khong co. Neu du lieu khong du
// manh de lac quan/bi quan, PHAI thua nhan bang confidence THAP thay vi
// guong ep ket luan.
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
// Doi tu "gemini-3.6-flash" (Free Tier chi 20 request/ngay - qua thap,
// het quota chi sau ~4 lan chay debate) sang "gemini-3.5-flash-lite"
// (Free Tier 500 request/ngay - gap 25 lan, du cho ca cron va nguoi
// dung bam nut nhieu lan/ngay). Flash-Lite duoc Google khuyen nghi
// chinh thuc cho "structured JSON parsing" - dung use case cua debate
// nay (dung responseSchema cho moi luot).
export const DEBATE_MODEL_NAME = "gemini-3.5-flash-lite";
export const IS_SINGLE_PROVIDER_DEBATE = true;
export const IS_SINGLE_PROVIDER_JURY = true;

export interface DebateArgument { argument: string; confidencePct: number; citedFields: string[]; }

const BULL_SYSTEM_PROMPT = `Bạn là Bull Agent (phe lạc quan) trong hệ thống tranh luận đầu tư định lượng Global Quanta.

NHIỆM VỤ DUY NHẤT: Dựa HOÀN TOÀN trên dữ liệu định lượng được cung cấp trong "DỮ LIỆU ĐẦU VÀO", đưa ra luận điểm ỦNG HỘ khả năng giá tăng.

QUY TẮC BẮT BUỘC:
1. CHỈ được dùng số liệu trong "DỮ LIỆU ĐẦU VÀO". TUYỆT ĐỐI KHÔNG bịa thêm tin tức, sự kiện, tin đồn, hay bất kỳ số liệu nào không có trong dữ liệu.
2. Nếu dữ liệu KHÔNG đủ mạnh để lạc quan, BẮT BUỘC phải thừa nhận điều đó bằng confidencePct THẤP (dưới 40) thay vì gượng ép ra 1 luận điểm lạc quan không có cơ sở.
3. Luận điểm PHẢI trích dẫn ít nhất 1 con số/trường dữ liệu cụ thể đã cung cấp trong "citedFields".
4. Nếu có luận điểm phản biện của Bear Agent trong prompt, PHẢI phản hồi trực tiếp vào điểm yếu Bear đã chỉ ra — không lặp lại luận điểm cũ, không né tránh.
5. Viết bằng tiếng Việt, ngắn gọn (2-4 câu).
6. KHÔNG đưa ra khuyến nghị mua/bán cụ thể — chỉ trình bày luận điểm khách quan dựa trên dữ liệu.`;

const BEAR_SYSTEM_PROMPT = `Bạn là Bear Agent (phe bi quan/thận trọng) trong hệ thống tranh luận đầu tư định lượng Global Quanta.

NHIỆM VỤ DUY NHẤT: Dựa HOÀN TOÀN trên dữ liệu định lượng được cung cấp, đưa ra luận điểm PHẢN BIỆN/CẢNH BÁO rủi ro, và chỉ ra điểm yếu trong luận điểm của Bull Agent (nếu có).

QUY TẮC BẮT BUỘC:
1. CHỈ được dùng số liệu trong "DỮ LIỆU ĐẦU VÀO". TUYỆT ĐỐI KHÔNG bịa thêm tin tức, sự kiện, tin đồn, hay bất kỳ số liệu nào không có trong dữ liệu.
2. Nếu dữ liệu thực sự tích cực và không có rủi ro đáng kể, BẮT BUỘC phải thừa nhận điều đó bằng confidencePct THẤP (dưới 40) cho luận điểm bi quan — không gượng ép tìm rủi ro không có cơ sở.
3. Luận điểm PHẢI trích dẫn ít nhất 1 con số/trường dữ liệu cụ thể đã cung cấp trong "citedFields".
4. PHẢI đọc kỹ luận điểm của Bull Agent trong prompt, chỉ ra CỤ THỂ điểm yếu/thiếu sót/rủi ro mà Bull Agent chưa đề cập, dựa trên CÙNG dữ liệu — không chỉ lặp lại ý ngược lại chung chung.
5. Viết bằng tiếng Việt, ngắn gọn (2-4 câu).
6. KHÔNG đưa ra khuyến nghị mua/bán cụ thể — chỉ trình bày luận điểm khách quan dựa trên dữ liệu.`;

function buildDataSection(dataPackageJson: string): string {
  return `DỮ LIỆU ĐẦU VÀO:\n${dataPackageJson}`;
}

/** Retry khi Gemini tra ve 503 (qua tai tam thoi, khong phai loi that
 * su ve code/key) - toi da 2 lan thu lai, delay tang dan (2s, 5s). Cac
 * loi KHAC (401, 400...) khong retry - fail ngay vi retry se khong
 * giai quyet duoc (loi thuc su ve cau hinh/du lieu). */
async function withGeminiRetry<T>(fn: () => Promise<T>): Promise<T> {
  const delaysMs = [1000, 3000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const is503 = err instanceof Error && (err.message.includes("503") || err.message.includes("Service Unavailable") || err.message.includes("overloaded"));
      if (!is503 || attempt === delaysMs.length) throw err;
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
    }
  }
  throw lastErr;
}

const debateResponseSchema = {
  type: "object" as const,
  properties: {
    argument: { type: "string" as const, description: "Luận điểm, 2-4 câu tiếng Việt" },
    confidencePct: { type: "number" as const, description: "Độ tin cậy 0-100" },
    citedFields: { type: "array" as const, items: { type: "string" as const }, description: "Các trường dữ liệu đã trích dẫn" },
  },
  required: ["argument", "confidencePct", "citedFields"],
};

async function callGeminiAgent(systemPrompt: string, userPrompt: string): Promise<DebateArgument> {
  return withGeminiRetry(async () => {
    const model = genAI.getGenerativeModel({
      model: DEBATE_MODEL_NAME,
      systemInstruction: systemPrompt,
      generationConfig: { responseMimeType: "application/json", responseSchema: debateResponseSchema as any },
    });
    const result = await model.generateContent(userPrompt);
    const parsed = JSON.parse(result.response.text()) as { argument: string; confidencePct: number; citedFields: string[] };
    return { argument: parsed.argument, confidencePct: Math.max(0, Math.min(100, parsed.confidencePct)), citedFields: parsed.citedFields ?? [] };
  });
}

/** Bull Agent - Gemini voi BULL_SYSTEM_PROMPT (lac quan). */
export async function runBullAgent(dataPackageJson: string, bearArgument?: string): Promise<DebateArgument> {
  const prompt = bearArgument
    ? `${buildDataSection(dataPackageJson)}\n\nLUẬN ĐIỂM PHẢN BIỆN CỦA BEAR AGENT (cần phản hồi trực tiếp):\n"${bearArgument}"\n\nHãy đưa ra luận điểm ủng hộ, PHẢN HỒI vào đúng điểm Bear Agent vừa nêu.`
    : `${buildDataSection(dataPackageJson)}\n\nHãy đưa ra luận điểm ủng hộ khả năng giá tăng.`;
  return callGeminiAgent(BULL_SYSTEM_PROMPT, prompt);
}

/** Bear Agent - Gemini voi BEAR_SYSTEM_PROMPT (bi quan). CUNG provider
 * voi Bull Agent (khac voi thiet ke ban dau dung Claude) - xem ghi chu
 * dau file ve "self-consistency debate". */
export async function runBearAgent(dataPackageJson: string, bullArgument: string): Promise<DebateArgument> {
  const prompt = `${buildDataSection(dataPackageJson)}\n\nLUẬN ĐIỂM CỦA BULL AGENT (cần chỉ ra điểm yếu):\n"${bullArgument}"\n\nHãy đưa ra luận điểm phản biện.`;
  return callGeminiAgent(BEAR_SYSTEM_PROMPT, prompt);
}

// ============================================================
// MUC B (Tech Spec v2) Giai doan 3/4: Jury of Judges.
//
// MINH BACH: thiet ke goc de xuat 3 MODEL PROVIDER khac nhau (Gemini +
// GPT + Claude). Vi CHI CON Gemini kha dung (xem ghi chu dau file), 2
// Judge o day CUNG la Gemini nhung VOI TEMPERATURE KHAC NHAU (0.2 va
// 0.9) - tao do da dang goc nhin trong pham vi 1 provider (self-
// consistency), KHONG PHAI "true multi-model jury". Field
// "isSingleProviderJury: true" tra ve o response de minh bach dieu nay.

export interface JudgeVote { judge: string; verdict: "bullish" | "bearish" | "neutral"; confidencePct: number; reasoning: string; }

const JUDGE_SYSTEM_PROMPT = `Bạn là Judge (trọng tài độc lập) trong hệ thống Multi-Agent Debate Global Quanta.

NHIỆM VỤ DUY NHẤT: Đọc toàn bộ cuộc tranh luận giữa Bull Agent (lạc quan) và Bear Agent (bi quan) — cả 2 đều lập luận dựa trên CÙNG 1 bộ dữ liệu định lượng thật — và đưa ra phán quyết KHÁCH QUAN bên nào có lập luận chắc chắn hơn.

QUY TẮC BẮT BUỘC:
1. Đánh giá dựa trên CHẤT LƯỢNG bằng chứng và tính logic của lập luận trong "rounds" — KHÔNG được chỉ copy lại confidencePct mà mỗi Agent tự báo cho chính mình (đó là tự đánh giá, không phải phán quyết khách quan của bạn).
2. Nếu 1 bên trích dẫn nhiều số liệu cụ thể hơn và phản biện trực tiếp vào điểm yếu của bên kia, bên đó đáng tin hơn — dù confidence tự báo của họ thấp hơn.
3. verdict = "neutral" nếu cả 2 bên đều có lập luận mạnh ngang nhau, hoặc dữ liệu thực sự không đủ để nghiêng hẳn về 1 phía.
4. confidencePct là ĐỘ TỰ TIN CỦA CHÍNH BẠN vào phán quyết này (0-100), không phải trung bình cộng của 2 Agent.
5. reasoning ngắn gọn (2-3 câu), giải thích TẠI SAO bạn chọn verdict này dựa trên chất lượng lập luận đã đọc.
6. Viết bằng tiếng Việt.`;

const judgeResponseSchema = {
  type: "object" as const,
  properties: {
    verdict: { type: "string" as const, enum: ["bullish", "bearish", "neutral"] },
    confidencePct: { type: "number" as const, description: "Độ tự tin của chính Judge vào phán quyết, 0-100" },
    reasoning: { type: "string" as const, description: "2-3 câu giải thích tiếng Việt" },
  },
  required: ["verdict", "confidencePct", "reasoning"],
};

async function callJudge(judgeLabel: string, temperature: number, debateTranscript: string, lmsrFinalPricePct: number): Promise<JudgeVote> {
  return withGeminiRetry(async () => {
    const model = genAI.getGenerativeModel({
      model: DEBATE_MODEL_NAME,
      systemInstruction: JUDGE_SYSTEM_PROMPT,
      generationConfig: { responseMimeType: "application/json", responseSchema: judgeResponseSchema as any, temperature },
    });
    const prompt = `TOÀN BỘ CUỘC TRANH LUẬN (rounds):\n${debateTranscript}\n\nXác suất thị trường nội bộ (LMSR) sau debate: ${lmsrFinalPricePct}% nghiêng về phía tăng.\n\nHãy đưa ra phán quyết khách quan.`;
    const result = await model.generateContent(prompt);
    const parsed = JSON.parse(result.response.text()) as { verdict: "bullish" | "bearish" | "neutral"; confidencePct: number; reasoning: string };
    return { judge: judgeLabel, verdict: parsed.verdict, confidencePct: Math.max(0, Math.min(100, parsed.confidencePct)), reasoning: parsed.reasoning };
  });
}

/** Chay 2 Judge DOC LAP (temperature khac nhau) tren CUNG 1 debate
 * transcript, tra ve ca 2 vote de nguoi dung tu xem xet (khong an di
 * truong hop bat dong). */
export async function runJury(rounds: { round: number; side: string; argument: string }[], lmsrFinalPricePct: number): Promise<JudgeVote[]> {
  const transcript = rounds.map((r) => `[Round ${r.round} - ${r.side === "bull" ? "Bull" : "Bear"}]: ${r.argument}`).join("\n\n");
  const [judge1, judge2] = await Promise.all([
    callJudge("Judge-A", 0.2, transcript, lmsrFinalPricePct),
    callJudge("Judge-B", 0.9, transcript, lmsrFinalPricePct),
  ]);
  return [judge1, judge2];
}

/** Tong hop 2 vote thanh 1 finalVerdict:
 *   - Neu 2 Judge DONG THUAN (cung verdict) -> dung luon, confidence = trung binh.
 *   - Neu BAT DONG -> tie-breaker: verdict cua Judge co confidencePct CAO HON
 *     thang the (Judge tu tin hon duoc uu tien), ghi ro day la tie-break. */
export function resolveJuryVerdict(votes: JudgeVote[]): { finalVerdict: "bullish" | "bearish" | "neutral"; isTieBreak: boolean; avgConfidencePct: number } {
  const [v1, v2] = votes;
  const avgConfidencePct = Math.round((v1.confidencePct + v2.confidencePct) / 2);
  if (v1.verdict === v2.verdict) {
    return { finalVerdict: v1.verdict, isTieBreak: false, avgConfidencePct };
  }
  const winner = v1.confidencePct >= v2.confidencePct ? v1 : v2;
  return { finalVerdict: winner.verdict, isTieBreak: true, avgConfidencePct };
}
