// X4 — Bộ công cụ của "Hỏi đáp xúc tác":
//   - 6 công cụ vĩ mô (macro_*) của gói MacroCenter — đặc tả + thực thi trên Gateway (/api/macro/tools[/:name]);
//   - macro_catalyst_calendar — lịch vĩ mô hợp nhất trên Gateway (X3);
//   - 3 công cụ xúc tác (catalyst_*) — đọc snapshot engine Chất xúc tác.
// Mọi công cụ CHỈ ĐỌC.
import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { MARKET_GATEWAY_URL } from "@/lib/market-data/ssi-gateway-adapter";
import { CATALYST_TOOL_SPECS, runCatalystTool, type CatalystSnapshotLike, type ChatToolResult } from "./catalystTools";

interface GatewayToolSpecs {
  anthropic: { name: string; description: string; input_schema: Record<string, unknown> }[];
  systemPrompt: string;
  mode: "real" | "synthetic";
  notice: string | null;
}

let specsCache: { at: number; value: GatewayToolSpecs } | null = null;

export async function fetchMacroToolSpecs(fetchImpl: typeof fetch = fetch): Promise<GatewayToolSpecs | null> {
  if (specsCache && Date.now() - specsCache.at < 10 * 60_000) return specsCache.value;
  try {
    const res = await fetchImpl(`${MARKET_GATEWAY_URL}/api/macro/tools`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return specsCache?.value ?? null;
    const value = (await res.json()) as GatewayToolSpecs;
    specsCache = { at: Date.now(), value };
    return value;
  } catch {
    return specsCache?.value ?? null;
  }
}

const CALENDAR_TOOL: BetaTool = {
  name: "macro_catalyst_calendar",
  description: "Lịch vĩ mô sắp tới dưới dạng sự kiện xúc tác: ngày công bố số liệu VN (GSO, NHNN, PMI — ƯỚC TÍNH), họp FOMC (ngày chính thức), cảnh báo / chuyển chế độ vĩ mô (chỉ khi có số liệu thật). Dùng khi hỏi 'sắp có sự kiện vĩ mô gì'.",
  input_schema: { type: "object", properties: { horizonDays: { type: "integer", minimum: 1, maximum: 180, description: "Số ngày tới, mặc định 45." } }, required: [], additionalProperties: false },
};

export function buildToolList(macro: GatewayToolSpecs | null): BetaTool[] {
  const macroTools: BetaTool[] = (macro?.anthropic ?? []).map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema as BetaTool["input_schema"] }));
  // eager_input_streaming: tham số công cụ stream ngay khi sinh; server không còn kiểm tra -> mọi tham số đều được kiểm tra lại
  // (công cụ vĩ mô: validateArgs trên Gateway; công cụ xúc tác: runCatalystTool).
  return [...macroTools, CALENDAR_TOOL, ...CATALYST_TOOL_SPECS].map((t) => ({ ...t, eager_input_streaming: true }));
}

export function createToolExecutor({ getSnapshot, fetchImpl = fetch }: { getSnapshot: () => Promise<CatalystSnapshotLike | null>; fetchImpl?: typeof fetch }) {
  let snap: Promise<CatalystSnapshotLike | null> | null = null;
  return async (name: string, input: unknown): Promise<ChatToolResult> => {
    if (name.startsWith("catalyst_")) {
      snap ??= getSnapshot().catch(() => null);
      return runCatalystTool(name, input, await snap);
    }
    if (name === "macro_catalyst_calendar") {
      const h = (input as { horizonDays?: unknown })?.horizonDays;
      const horizonDays = Number.isInteger(h) && (h as number) >= 1 && (h as number) <= 180 ? (h as number) : 45;
      const res = await fetchImpl(`${MARKET_GATEWAY_URL}/api/macro/catalyst-events?horizonDays=${horizonDays}`, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) return { ok: false, error: `Không lấy được lịch vĩ mô (HTTP ${res.status}).` };
      const b = await res.json();
      return { ok: true, notice: b.notice ?? null, data: { asOf: b.asOf, events: b.events, mode: b.mode }, guidance: [b.caveat, "Lịch công bố số liệu không có hướng tốt/xấu — chỉ biết sau khi công bố."] };
    }
    if (name.startsWith("macro_")) {
      const res = await fetchImpl(`${MARKET_GATEWAY_URL}/api/macro/tools/${encodeURIComponent(name)}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input ?? {}), signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) return { ok: false, error: res.status === 429 ? "Trung tâm vĩ mô đang quá tải — thử lại sau." : `Trung tâm vĩ mô lỗi HTTP ${res.status}.` };
      return (await res.json()) as ChatToolResult;
    }
    return { ok: false, error: `Không có công cụ ${name}.` };
  };
}

export function buildSystemPrompt(macro: GatewayToolSpecs | null, todayVn: string): string {
  return [
    `Bạn là trợ lý "Hỏi đáp xúc tác" trong ứng dụng phân tích chứng khoán Việt Nam. Hôm nay là ${todayVn} (giờ Việt Nam).`,
    "Nhiệm vụ: trả lời câu hỏi về chất xúc tác (tin tức, sự kiện, chính sách tác động tới ngành/mã) và bối cảnh vĩ mô, CHỈ dựa trên kết quả công cụ.",
    "",
    "Quy tắc chung (bắt buộc):",
    "- Gọi công cụ trước khi nêu bất kỳ con số, ngành, mã hay sự kiện cụ thể nào. Không có kết quả công cụ thì không có số liệu — nói rõ là chưa có dữ liệu.",
    "- Mọi con số trong câu trả lời phải lấy nguyên từ kết quả công cụ (có thể làm tròn). Hệ thống tự kiểm tra và hiện cảnh báo nếu có con số không truy được.",
    "- Nếu kết quả có trường notice (dữ liệu mô phỏng, dữ liệu cũ) thì nêu ngay câu đầu tiên.",
    "- Không đưa khuyến nghị mua/bán, giá mục tiêu hay tỷ trọng. Trình bày như thông tin tham khảo, kèm mức độ bằng chứng.",
    "- Tỷ lệ thắng lịch sử dưới 50% nghĩa là nhóm tín hiệu đó chưa tốt hơn ngẫu nhiên — phải nói rõ, không tô hồng.",
    "- Quan hệ vĩ mô là thống kê lịch sử, không phải nhân quả; điểm vĩ mô (MacroScore) CHỈ để tham khảo.",
    "- Trả lời bằng tiếng Việt, ngắn gọn: kết luận trước, 1–3 con số quan trọng, rồi lưu ý. Dùng gạch đầu dòng khi liệt kê; không dùng bảng dài.",
    "",
    macro?.systemPrompt ?? "Công cụ vĩ mô hiện không khả dụng — nếu được hỏi về vĩ mô, nói thật là không lấy được dữ liệu.",
  ].join("\n");
}
