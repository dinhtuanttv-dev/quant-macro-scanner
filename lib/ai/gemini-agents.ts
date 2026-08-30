import { GoogleGenerativeAI } from "@google/generative-ai";
import { marketAgentSchema, newsAgentSchema, evidenceAgentSchema } from "./schemas";
import { VALID_SECTOR_KEYS } from "@/lib/mapping/macro-mapping";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const MARKET_AGENT_SYSTEM_PROMPT = `Bạn là Market Agent trong hệ thống phân tích tài chính Global Quanta.

NHIỆM VỤ DUY NHẤT: Phân tích dữ liệu thị trường thô (giá, % thay đổi) được cung cấp, xác định ngành nào bị ảnh hưởng.

QUY TẮC BẮT BUỘC:
1. CHỈ sử dụng dữ liệu số liệu được cung cấp trong phần "DỮ LIỆU ĐẦU VÀO" bên dưới. TUYỆT ĐỐI KHÔNG bịa thêm số liệu, sự kiện, hay tin tức không có trong dữ liệu.
2. Trường "affectedSectorKeys" CHỈ được chọn từ danh sách sau: ${VALID_SECTOR_KEYS.join(", ")}. Không tự tạo key mới.
3. Mỗi kết luận PHẢI có "evidenceRefs" trỏ đến ID của data point cụ thể đã dùng.
4. Nếu dữ liệu không đủ để kết luận, hãy đặt confidence thấp (<0.4) thay vì đoán mò.
5. KHÔNG đưa ra khuyến nghị đầu tư cụ thể (mua/bán). Chỉ mô tả tác động khách quan.`;

const NEWS_AGENT_SYSTEM_PROMPT = `Bạn là News Agent trong hệ thống phân tích tài chính Global Quanta.

NHIỆM VỤ DUY NHẤT: Tóm tắt và phân loại mức độ quan trọng của tin tức được cung cấp.

QUY TẮC BẮT BUỘC:
1. "sourceUrl" PHẢI là URL thật lấy từ dữ liệu tin tức được cung cấp trong prompt. TUYỆT ĐỐI KHÔNG tự tạo URL.
2. Nếu tin tức không có URL nguồn rõ ràng, KHÔNG được xử lý tin đó — bỏ qua và không trả về kết quả cho tin này.
3. "sentimentScore" phải phản ánh đúng nội dung tin, không suy diễn quá mức từ tiêu đề.`;

const EVIDENCE_AGENT_SYSTEM_PROMPT = `Bạn là Evidence Agent — lớp kiểm tra chéo cuối cùng trong hệ thống Global Quanta.

NHIỆM VỤ DUY NHẤT: Đối chiếu kết luận của Market Agent và News Agent với dữ liệu gốc, phát hiện mâu thuẫn.

QUY TẮC BẮT BUỘC:
1. So sánh TỪNG con số trong kết luận với dữ liệu gốc được cung cấp.
2. Nếu evidenceRefs trỏ đến data point KHÔNG TỒN TẠI trong dữ liệu gốc, đánh dấu verified=false ngay lập tức.
3. Nếu phát hiện agent khác đã suy diễn vượt quá dữ liệu cung cấp (hallucination), liệt kê rõ trong "discrepancies".
4. "finalConfidence" phải THẤP HƠN HOẶC BẰNG confidence gốc của Market/News Agent — Evidence Agent không được tự nâng độ tin cậy.`;

interface DataPoint { id: string; label: string; value: number | string; timestamp: string; }

export async function runMarketAgent(dataPoints: DataPoint[]) {
  const model = genAI.getGenerativeModel({
    model: "gemini-3.6-flash",
    systemInstruction: MARKET_AGENT_SYSTEM_PROMPT,
    generationConfig: { responseMimeType: "application/json", responseSchema: marketAgentSchema as any },
  });
  const prompt = `DỮ LIỆU ĐẦU VÀO:\n${JSON.stringify(dataPoints, null, 2)}\n\nPhân tích tác động đến thị trường Việt Nam.`;
  const result = await model.generateContent(prompt);
  return JSON.parse(result.response.text());
}

export async function runNewsAgent(newsItems: { title: string; url: string; publishedAt: string }[]) {
  const model = genAI.getGenerativeModel({
    model: "gemini-3.6-flash",
    systemInstruction: NEWS_AGENT_SYSTEM_PROMPT,
    generationConfig: { responseMimeType: "application/json", responseSchema: newsAgentSchema as any },
  });
  const prompt = `TIN TỨC ĐẦU VÀO:\n${JSON.stringify(newsItems, null, 2)}`;
  const result = await model.generateContent(prompt);
  return JSON.parse(result.response.text());
}

export async function runEvidenceAgent(
  originalData: DataPoint[],
  marketAgentOutput: unknown,
  newsAgentOutput: unknown,
  originalNewsItems: { title: string; url: string; publishedAt: string }[] = []
) {
  const model = genAI.getGenerativeModel({
    model: "gemini-3.6-flash",
    systemInstruction: EVIDENCE_AGENT_SYSTEM_PROMPT,
    generationConfig: { responseMimeType: "application/json", responseSchema: evidenceAgentSchema as any },
  });
  // FIX (2026-08-29): truoc day Evidence Agent chi nhan "DU LIEU GOC" la
  // dataPoints (thi truong), KHONG co tin tuc RSS that -> luon bao
  // verified:false cho News Agent vi "khong tim thay trong du lieu goc",
  // du News Agent tra loi dung 100%. Gio them muc "TIN TUC GOC" rieng de
  // Evidence Agent co du lieu that de doi chieu voi ket luan News Agent.
  const prompt = `DỮ LIỆU THỊ TRƯỜNG GỐC:\n${JSON.stringify(originalData, null, 2)}\n\nTIN TỨC GỐC (danh sách tin tức thật đã cung cấp cho News Agent):\n${JSON.stringify(originalNewsItems, null, 2)}\n\nKẾT LUẬN MARKET AGENT:\n${JSON.stringify(marketAgentOutput, null, 2)}\n\nKẾT LUẬN NEWS AGENT:\n${JSON.stringify(newsAgentOutput, null, 2)}\n\nKiểm tra: Market Agent phải đối chiếu với DỮ LIỆU THỊ TRƯỜNG GỐC, News Agent phải đối chiếu với TIN TỨC GỐC (không phải dữ liệu thị trường).`;
  const result = await model.generateContent(prompt);
  return JSON.parse(result.response.text());
}

export async function runMultiAgentAnalysis(dataPoints: DataPoint[], newsItems: { title: string; url: string; publishedAt: string }[]) {
  const [marketResult, newsResult] = await Promise.all([
    runMarketAgent(dataPoints),
    newsItems.length > 0 ? runNewsAgent(newsItems) : Promise.resolve(null),
  ]);

  const evidenceResult = await runEvidenceAgent(dataPoints, marketResult, newsResult, newsItems);

  return {
    market: marketResult, news: newsResult, evidence: evidenceResult,
    finalConfidence: evidenceResult.verified ? evidenceResult.finalConfidence : Math.min(0.3, evidenceResult.finalConfidence),
    disclaimer: "Thông tin mang tính tham khảo, không phải khuyến nghị đầu tư.",
  };
}
