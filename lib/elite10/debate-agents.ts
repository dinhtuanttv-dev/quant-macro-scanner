// Elite 10 - Muc A/B (Tech Spec v2) Giai doan 2/4: Multi-Agent Debate
// THAT - Bull Agent = Claude Sonnet 4.6, Bear Agent = Gemini. MODULE
// HOAN TOAN MOI, dung LAI pattern goi API da co san (chat/route.ts cho
// Claude, gemini-agents.ts cho Gemini), KHONG sua file nao dang chay.
//
// NGUYEN TAC BAT BUOC (giong moi Agent khac trong du an): CHI duoc lap
// luan tu DU LIEU DINH LUONG duoc cung cap trong prompt - TUYET DOI
// KHONG bia them tin tuc/su kien/so lieu khong co. Neu du lieu khong du
// manh de lac quan/bi quan, PHAI thua nhan bang confidence THAP thay vi
// guong ep ket luan.
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

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

/** Bull Agent = Claude Sonnet 4.6, dung "tool use" de ep JSON output
 * chat che (Anthropic SDK khong co responseSchema nhu Gemini). */
export async function runBullAgent(dataPackageJson: string, bearArgument?: string): Promise<DebateArgument> {
  const prompt = bearArgument
    ? `${buildDataSection(dataPackageJson)}\n\nLUẬN ĐIỂM PHẢN BIỆN CỦA BEAR AGENT (cần phản hồi trực tiếp):\n"${bearArgument}"\n\nHãy đưa ra luận điểm ủng hộ, PHẢN HỒI vào đúng điểm Bear Agent vừa nêu.`
    : `${buildDataSection(dataPackageJson)}\n\nHãy đưa ra luận điểm ủng hộ khả năng giá tăng.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    system: BULL_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
    tools: [{
      name: "submit_argument",
      description: "Nộp luận điểm và độ tin cậy",
      input_schema: {
        type: "object",
        properties: {
          argument: { type: "string", description: "Luận điểm ủng hộ, 2-4 câu tiếng Việt" },
          confidencePct: { type: "number", description: "Độ tin cậy 0-100" },
          citedFields: { type: "array", items: { type: "string" }, description: "Các trường dữ liệu đã trích dẫn" },
        },
        required: ["argument", "confidencePct", "citedFields"],
      },
    }],
    tool_choice: { type: "tool", name: "submit_argument" },
  });

  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("Bull Agent (Claude) không trả về tool_use hợp lệ.");
  const input = toolUse.input as { argument: string; confidencePct: number; citedFields: string[] };
  return { argument: input.argument, confidencePct: Math.max(0, Math.min(100, input.confidencePct)), citedFields: input.citedFields ?? [] };
}

const bearResponseSchema = {
  type: "object" as const,
  properties: {
    argument: { type: "string" as const, description: "Luận điểm phản biện, 2-4 câu tiếng Việt" },
    confidencePct: { type: "number" as const, description: "Độ tin cậy 0-100" },
    citedFields: { type: "array" as const, items: { type: "string" as const }, description: "Các trường dữ liệu đã trích dẫn" },
  },
  required: ["argument", "confidencePct", "citedFields"],
};

/** Bear Agent = Gemini, dung responseSchema co san pattern (giong
 * gemini-agents.ts) de ep JSON output. */
export async function runBearAgent(dataPackageJson: string, bullArgument: string): Promise<DebateArgument> {
  const model = genAI.getGenerativeModel({
    model: "gemini-3.6-flash",
    systemInstruction: BEAR_SYSTEM_PROMPT,
    generationConfig: { responseMimeType: "application/json", responseSchema: bearResponseSchema as any },
  });
  const prompt = `${buildDataSection(dataPackageJson)}\n\nLUẬN ĐIỂM CỦA BULL AGENT (cần chỉ ra điểm yếu):\n"${bullArgument}"\n\nHãy đưa ra luận điểm phản biện.`;
  const result = await model.generateContent(prompt);
  const parsed = JSON.parse(result.response.text()) as { argument: string; confidencePct: number; citedFields: string[] };
  return { argument: parsed.argument, confidencePct: Math.max(0, Math.min(100, parsed.confidencePct)), citedFields: parsed.citedFields ?? [] };
}
