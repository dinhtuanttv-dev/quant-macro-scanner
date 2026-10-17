import { GoogleGenerativeAI } from "@google/generative-ai";
import { marketAgentSchema, newsAgentSchema, evidenceAgentSchema, dividendAnalysisSchema } from "./schemas";
import { VALID_SECTOR_KEYS } from "@/lib/mapping/macro-mapping";
import type { WorldAiContext } from "./world-context";
import { verifySectorImpacts, type CheckedImpact } from "./verify-sector-impacts";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// NANG CAP (2026-09-11): prompt sua lai de yeu cau RO RANG moi nganh phai
// co ket luan RIENG, tranh Gemini "lam bieng" copy 1 direction/reasoning
// cho tat ca sectorImpacts (hanh vi thuc te da gap khi chi doi schema ma
// khong doi ca huong dan prompt).
// 2026-10-17: khi có ngữ cảnh Gateway, sectorKey = MÃ NGÀNH ICB VIỆT NAM (danh sách động) và agent nhận điểm định lượng
// thuận/ngược gió đã kiểm định đặt trước — phần bổ sung ICB_RULES bên dưới.
const ICB_RULES = (sectorList: string) => `

BỔ SUNG (chế độ ngành ICB Việt Nam):
A. "sectorKey" là MÃ NGÀNH ICB 4 chữ số, CHỈ chọn trong danh sách: ${sectorList}.
B. Các data point "ws:<mã ICB>" là ĐIỂM ĐỊNH LƯỢNG ngành thế giới → ngành VN (độ lệch chuẩn σ). Xếp hạng ngắn hạn đã qua kiểm định
   đặt trước nhưng lợi thế NHỎ (IC ≈ 0,02); trung hạn CHƯA đạt kiểm định. KHÔNG kết luận trái chiều với điểm ngắn hạn khi |điểm| ≥ 0,5
   trừ khi có tin tức cụ thể trong dữ liệu — nếu vậy phải trích dẫn tin đó và nêu rõ lý do.
C. Mỗi ngành trong sectorImpacts PHẢI trích dẫn ít nhất 1 ID "ws:<mã>" của chính ngành đó cộng các ID chỉ số / hàng hoá (mk:, mc:, cm:) liên quan.
D. Ưu tiên tối đa 8 ngành có |điểm| lớn nhất hoặc có hàng hoá/tin tức rõ ràng; không liệt kê ngành không có cơ sở.
E. Các data point "st:<mã ICB>" là CHIẾN LƯỢC định lượng (α ngắn hạn = IC·σ·z, P vượt VN-Index, tư thế; trung hạn chỉ là bối cảnh, KHÔNG dự báo). Khi nhắc tới tư thế/α phải trích dẫn "st:<mã>"; nêu rõ lợi thế nhỏ, không biến thành khuyến nghị mua/bán.`;

const MARKET_AGENT_SYSTEM_PROMPT = `Bạn là Market Agent trong hệ thống phân tích tài chính Global Quanta.

NHIỆM VỤ DUY NHẤT: Phân tích dữ liệu thị trường thô (giá, % thay đổi) được cung cấp, xác định NGÀNH NÀO bị ảnh hưởng VÀ TÁC ĐỘNG RIÊNG của sự kiện lên TỪNG NGÀNH đó.

QUY TẮC BẮT BUỘC:
1. CHỈ sử dụng dữ liệu số liệu được cung cấp trong phần "DỮ LIỆU ĐẦU VÀO" bên dưới. TUYỆT ĐỐI KHÔNG bịa thêm số liệu, sự kiện, hay tin tức không có trong dữ liệu.
2. "sectorKey" trong mỗi phần tử CHỈ được chọn từ danh sách sau: ${VALID_SECTOR_KEYS.join(", ")}. Không tự tạo key mới.
3. QUAN TRỌNG NHẤT: một sự kiện vĩ mô THƯỜNG tác động TRÁI CHIỀU giữa các ngành khác nhau (ví dụ: lãi suất tăng thường TỐT cho Ngân hàng nhưng XẤU cho Bất động sản/ngành vay nợ nhiều). BẮT BUỘC đánh giá "direction" và viết "reasoningVi" RIÊNG BIỆT cho từng ngành trong "sectorImpacts" — TUYỆT ĐỐI KHÔNG gán cùng một direction hoặc copy nguyên văn cùng một câu reasoning cho nhiều ngành khác nhau, trừ khi có lý do tài chính thực sự khiến chúng giống hệt nhau.
4. Mỗi kết luận PHẢI có "evidenceRefs" trỏ đến ID của data point cụ thể đã dùng CHO NGÀNH ĐÓ (không phải danh sách chung cho tất cả).
5. Nếu dữ liệu không đủ để kết luận về 1 ngành cụ thể, hãy đặt confidence thấp (<0.4) cho ngành đó thay vì đoán mò, hoặc bỏ qua không đưa ngành đó vào "sectorImpacts".
6. KHÔNG đưa ra khuyến nghị đầu tư cụ thể (mua/bán). Chỉ mô tả tác động khách quan.
7. "overallSummaryVi" chỉ là 1 câu bối cảnh chung ngắn gọn (không lặp lại lý do của từng ngành).`;

const NEWS_AGENT_SYSTEM_PROMPT = `Bạn là News Agent trong hệ thống phân tích tài chính Global Quanta.

NHIỆM VỤ DUY NHẤT: Tóm tắt và phân loại mức độ quan trọng của tin tức được cung cấp.

QUY TẮC BẮT BUỘC:
1. "sourceUrl" PHẢI là URL thật lấy từ dữ liệu tin tức được cung cấp trong prompt. TUYỆT ĐỐI KHÔNG tự tạo URL.
2. Nếu tin tức không có URL nguồn rõ ràng, KHÔNG được xử lý tin đó — bỏ qua và không trả về kết quả cho tin này.
3. "sentimentScore" phải phản ánh đúng nội dung tin, không suy diễn quá mức từ tiêu đề.`;

// NANG CAP: Evidence Agent gio kiem chung TUNG NGANH rieng biet, khop
// theo dung "sectorKey" (khong phai 1 verified/finalConfidence chung).
const EVIDENCE_AGENT_SYSTEM_PROMPT = `Bạn là Evidence Agent — lớp kiểm tra chéo cuối cùng trong hệ thống Global Quanta.

NHIỆM VỤ DUY NHẤT: Đối chiếu TỪNG NGÀNH trong kết luận của Market Agent (mảng sectorImpacts) với dữ liệu gốc, phát hiện mâu thuẫn RIÊNG cho từng ngành.

QUY TẮC BẮT BUỘC:
1. "sectorVerifications" PHẢI có đúng số phần tử và đúng "sectorKey" tương ứng với "sectorImpacts" của Market Agent — kiểm chứng TỪNG ngành một, không gộp chung.
2. So sánh TỪNG con số trong evidenceRefs của MỖI ngành với dữ liệu gốc được cung cấp.
3. Nếu evidenceRefs của 1 ngành trỏ đến data point KHÔNG TỒN TẠI trong dữ liệu gốc, đánh dấu verified=false CHO NGÀNH ĐÓ (không ảnh hưởng các ngành khác nếu chúng đúng).
4. Nếu phát hiện Market Agent gán CÙNG MỘT direction/reasoning cho nhiều ngành một cách vô lý (không có cơ sở tài chính để giống nhau), liệt kê rõ trong "discrepancies" của ngành đó.
5. "finalConfidence" của mỗi ngành PHẢI THẤP HƠN HOẶC BẰNG confidence gốc Market Agent đã gán cho ngành đó — Evidence Agent không được tự nâng độ tin cậy.
6. Với News Agent: so sánh với TIN TỨC GỐC (mục riêng trong prompt, không phải dữ liệu thị trường), trả về "newsVerified"/"newsDiscrepancies".`;

interface DataPoint { id: string; label: string; value: number | string; timestamp: string; }

// P2 (Bo Loc Co Phieu - Nhom B): agent RIENG cho Pros/Cons + Catalyst
// Score cua 1 ma co tuc, dua HOAN TOAN tren so lieu dinh luong da co -
// KHONG duoc bia them thong tin dinh tinh khong co trong du lieu.
const DIVIDEND_ANALYSIS_SYSTEM_PROMPT = `Bạn là Dividend Analysis Agent trong hệ thống Global Quanta.

NHIỆM VỤ DUY NHẤT: Từ CÁC CHỈ SỐ ĐỊNH LƯỢNG được cung cấp (P/E, ROE, Nợ/Vốn chủ sở hữu, F-Score, Tăng trưởng lợi nhuận, Tỷ lệ chi trả cổ tức, Dividend Quality Score, sự kiện cổ tức gần nhất...), rút ra 2-4 điểm mạnh (pros), 2-4 điểm yếu/rủi ro (cons), và ước lượng Catalyst Score (1-10).

QUY TẮC BẮT BUỘC:
1. CHỈ được suy luận từ CÁC CON SỐ được cung cấp trong phần "DỮ LIỆU ĐẦU VÀO". TUYỆT ĐỐI KHÔNG bịa thêm thông tin về ban lãnh đạo, chiến lược kinh doanh, tin tức, giao dịch nội bộ, hay bất kỳ dữ liệu định tính nào KHÔNG có trong phần dữ liệu đầu vào.
2. Mỗi điểm mạnh/yếu PHẢI gắn trực tiếp với 1 con số cụ thể đã cung cấp (VD "Nợ/Vốn chủ sở hữu thấp (0.3x)" hợp lệ; "Ban lãnh đạo có tầm nhìn tốt" KHÔNG hợp lệ vì không có căn cứ số liệu).
3. Nếu 1 chỉ số bị thiếu (null/không có trong dữ liệu), KHÔNG được giả định giá trị cho nó - chỉ dùng những chỉ số THẬT SỰ có.
4. catalystScore là ước lượng khách quan dựa trên các chỉ số, KHÔNG PHẢI khuyến nghị mua/bán.
5. Viết bằng tiếng Việt, ngắn gọn, mỗi điểm 1 câu.`;

export async function runDividendAnalysisAgent(stockData: Record<string, unknown>) {
  const model = genAI.getGenerativeModel({
    model: "gemini-3.6-flash",
    systemInstruction: DIVIDEND_ANALYSIS_SYSTEM_PROMPT,
    generationConfig: { responseMimeType: "application/json", responseSchema: dividendAnalysisSchema as any },
  });
  const prompt = `DỮ LIỆU ĐẦU VÀO:\n${JSON.stringify(stockData, null, 2)}\n\nRút ra pros/cons/catalystScore CHỈ dựa trên các con số trên.`;
  const result = await model.generateContent(prompt);
  return JSON.parse(result.response.text());
}

export async function runMarketAgent(dataPoints: DataPoint[], ctx?: WorldAiContext | null) {
  const sectorList = ctx ? [...ctx.sectors.values()].map((s) => `${s.icb} (${s.nameVi})`).join(", ") : "";
  const system = ctx
    ? MARKET_AGENT_SYSTEM_PROMPT.replace(`"sectorKey" trong mỗi phần tử CHỈ được chọn từ danh sách sau: ${VALID_SECTOR_KEYS.join(", ")}. Không tự tạo key mới.`, `"sectorKey" là mã ngành ICB (xem mục A bên dưới). Không tự tạo mã mới.`) + ICB_RULES(sectorList)
    : MARKET_AGENT_SYSTEM_PROMPT;
  const model = genAI.getGenerativeModel({
    model: "gemini-3.6-flash",
    systemInstruction: system,
    generationConfig: { responseMimeType: "application/json", responseSchema: marketAgentSchema as any },
  });
  const prompt = `DỮ LIỆU ĐẦU VÀO:\n${JSON.stringify(dataPoints, null, 2)}\n\nPhân tích tác động đến thị trường Việt Nam. Nhớ: mỗi ngành trong sectorImpacts phải có direction/reasoningVi RIÊNG, không dùng chung 1 kết luận.`;
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
  const prompt = `DỮ LIỆU THỊ TRƯỜNG GỐC:\n${JSON.stringify(originalData, null, 2)}\n\nTIN TỨC GỐC (danh sách tin tức thật đã cung cấp cho News Agent):\n${JSON.stringify(originalNewsItems, null, 2)}\n\nKẾT LUẬN MARKET AGENT (mảng sectorImpacts theo từng ngành):\n${JSON.stringify(marketAgentOutput, null, 2)}\n\nKẾT LUẬN NEWS AGENT:\n${JSON.stringify(newsAgentOutput, null, 2)}\n\nKiểm tra TỪNG NGÀNH trong sectorImpacts đối chiếu với DỮ LIỆU THỊ TRƯỜNG GỐC (trả về đúng số phần tử, đúng sectorKey trong sectorVerifications). News Agent đối chiếu với TIN TỨC GỐC.`;
  const result = await model.generateContent(prompt);
  return JSON.parse(result.response.text());
}

interface SectorImpactRaw {
  sectorKey: string;
  direction: "bullish" | "bearish" | "neutral";
  confidence: number;
  reasoningVi: string;
  evidenceRefs: string[];
}

export interface SectorImpactResult extends SectorImpactRaw {
  verified: boolean;
  discrepancies: string[];
  /** chế độ ICB: điểm định lượng của ngành, mã thành phần thật, tên ngành */
  quant?: CheckedImpact["quant"];
  vnTickers?: string[];
  sectorNameVi?: string | null;
}

export interface MultiAgentAnalysisResult {
  overallSummaryVi: string;
  sectors: SectorImpactResult[];
  news: unknown;
  newsVerified: boolean;
  newsDiscrepancies: string[];
  disclaimer: string;
  /** "gateway-icb" = dữ liệu Gateway + mã ICB + kiểm chứng bằng code; "legacy" = bảng Supabase + khoá ngành cũ */
  mode: "gateway-icb" | "legacy";
}

export async function runMultiAgentAnalysis(dataPoints: DataPoint[], newsItems: { title: string; url: string; publishedAt: string }[], ctx?: WorldAiContext | null): Promise<MultiAgentAnalysisResult> {
  const [marketResult, newsResult] = await Promise.all([
    runMarketAgent(dataPoints, ctx),
    newsItems.length > 0 ? runNewsAgent(newsItems) : Promise.resolve(null),
  ]);

  const evidenceResult = await runEvidenceAgent(dataPoints, marketResult, newsResult, newsItems);

  // Ghep ket qua Market Agent + Evidence Agent THEO TUNG NGANH (khop bang
  // sectorKey) - day la buoc CHI CO O ban nang cap nay, thay the logic cu
  // "1 finalConfidence chung cho tat ca".
  const verificationMap = new Map<string, { verified: boolean; finalConfidence: number; discrepancies: string[] }>(
    (evidenceResult.sectorVerifications ?? []).map((v: any) => [v.sectorKey, v]),
  );

  if (ctx) {
    // chế độ ICB: kiểm chứng BẰNG CODE (ref thật, mã ICB hợp lệ, không trái chiều điểm định lượng) + kết quả Evidence Agent
    const sectors = verifySectorImpacts(marketResult.sectorImpacts ?? [], dataPoints, ctx.sectors, verificationMap);
    return {
      overallSummaryVi: marketResult.overallSummaryVi, sectors, news: newsResult,
      newsVerified: evidenceResult.newsVerified ?? false, newsDiscrepancies: evidenceResult.newsDiscrepancies ?? [],
      disclaimer: "Thông tin mang tính tham khảo, không phải khuyến nghị đầu tư. Kết luận AI được kiểm chứng bằng code với dữ liệu Gateway và điểm ngành định lượng.",
      mode: "gateway-icb",
    };
  }

  const sectors: SectorImpactResult[] = (marketResult.sectorImpacts ?? []).map((s: SectorImpactRaw) => {
    const verification = verificationMap.get(s.sectorKey);
    if (!verification) {
      // Evidence Agent khong tra ve kiem chung cho nganh nay (co the Gemini
      // bo sot) - AN TOAN: coi nhu chua kiem chung duoc, ha confidence
      // thay vi tin tuong mu quang vao Market Agent chua kiem tra cheo.
      return { ...s, verified: false, discrepancies: ["Evidence Agent không trả về kiểm chứng cho ngành này"], confidence: Math.min(0.3, s.confidence) };
    }
    return {
      ...s,
      verified: verification.verified,
      discrepancies: verification.discrepancies,
      // Dung finalConfidence tu Evidence Agent (da duoc rang buoc <= confidence goc
      // qua prompt), va ha them neu khong verified - giu nguyen tinh than
      // "khong tu nang do tin cay" cua ban cu.
      confidence: verification.verified ? verification.finalConfidence : Math.min(0.3, verification.finalConfidence),
    };
  });

  return {
    overallSummaryVi: marketResult.overallSummaryVi,
    sectors,
    news: newsResult,
    newsVerified: evidenceResult.newsVerified ?? false,
    newsDiscrepancies: evidenceResult.newsDiscrepancies ?? [],
    disclaimer: "Thông tin mang tính tham khảo, không phải khuyến nghị đầu tư.",
    mode: "legacy",
  };
}
