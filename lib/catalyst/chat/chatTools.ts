// X4 — Bộ công cụ của "Hỏi đáp xúc tác":
//   - 6 công cụ vĩ mô (macro_*) của gói MacroCenter — đặc tả + thực thi trên Gateway (/api/macro/tools[/:name]);
//   - macro_catalyst_calendar — lịch vĩ mô hợp nhất trên Gateway (X3);
//   - 3 công cụ xúc tác (catalyst_*) — đọc snapshot engine Chất xúc tác;
//   - 5 công cụ Kết nối thế giới (world_*) của gói macro-center 1.2 — đặc tả + thực thi trên Gateway (/api/world/tools[/:name]),
//     số liệu thật (thị trường, rổ ngành, yếu tố tháng, sự kiện đã kiểm duyệt);
//   - 5 công cụ ngành thế giới → ngành ICB VN (ws_*) — chiến lược ngành, ngành, hàng hoá, phơi nhiễm cổ phiếu (Gateway
//     /api/world-sectors/tools[/:name], Z1 2026-10-17);
//   - 3 công cụ trung tâm quyết định Elite 10 (elite_*) — danh mục, hồ sơ 360° một mã, bằng chứng tín hiệu (Gateway
//     /api/elite/tools[/:name], E5 2026-10-17).
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

export interface WorldToolSpecs {
  anthropic: { name: string; description: string; input_schema: Record<string, unknown> }[];
  guidelines: string;
  mode: "real" | "synthetic";
  notice: string | null;
}

/** Đặc tả công cụ trên Gateway, đệm 10 phút; lỗi -> bản đệm cũ hoặc null (bộ công cụ đó vắng mặt, chat vẫn chạy). */
function cachedSpecs<T>(path: string) {
  let cache: { at: number; value: T } | null = null;
  return async (fetchImpl: typeof fetch = fetch): Promise<T | null> => {
    if (cache && Date.now() - cache.at < 10 * 60_000) return cache.value;
    try {
      const res = await fetchImpl(`${MARKET_GATEWAY_URL}${path}`, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return cache?.value ?? null;
      const value = (await res.json()) as T;
      cache = { at: Date.now(), value };
      return value;
    } catch {
      return cache?.value ?? null;
    }
  };
}
export const fetchMacroToolSpecs = cachedSpecs<GatewayToolSpecs>("/api/macro/tools");
export const fetchWorldToolSpecs = cachedSpecs<WorldToolSpecs>("/api/world/tools");
export const fetchWsToolSpecs = cachedSpecs<WorldToolSpecs>("/api/world-sectors/tools");
export const fetchEliteToolSpecs = cachedSpecs<WorldToolSpecs>("/api/elite/tools");

/** E5: vai trò trong chế độ tranh luận của Phòng họp AI (Elite 10). */
export type ChatRole = "bull" | "bear" | "judge";
export const ROLE_PROMPTS: Record<ChatRole, string> = {
  bull: "VAI TRÒ: phe MUA trong một cuộc tranh luận có trọng tài. Xây dựng lập luận mạnh nhất cho việc nghiêng tỷ trọng TĂNG (mã hoặc danh mục được hỏi), CHỈ dựa trên kết quả công cụ. Bắt buộc: nêu bậc bằng chứng (A/B/C) của từng luận điểm, và kết thúc bằng điểm yếu lớn nhất của chính lập luận phe mua.",
  bear: "VAI TRÒ: phe BÁN / thận trọng trong một cuộc tranh luận có trọng tài. Xây dựng lập luận mạnh nhất cho việc GIẢM hoặc không tăng tỷ trọng (mã hoặc danh mục được hỏi), CHỈ dựa trên kết quả công cụ. Bắt buộc: nêu bậc bằng chứng (A/B/C) của từng luận điểm, và kết thúc bằng điểm yếu lớn nhất của chính lập luận phe bán.",
  judge: "VAI TRÒ: trọng tài độc lập. Câu hỏi chứa lập luận của phe mua và phe bán. Gọi công cụ để KIỂM CHỨNG các con số và luận điểm chính; chấm từng luận điểm theo bậc bằng chứng (A/B/C) và mức độ kiểm chứng được; chỉ rõ luận điểm sai, không truy được hoặc phóng đại. Kết luận cân bằng: bên nào có bằng chứng mạnh hơn và mạnh đến mức nào, kèm điều kiện cụ thể sẽ làm thay đổi kết luận. Không khuyến nghị mua/bán.",
};

const CALENDAR_TOOL: BetaTool = {
  name: "macro_catalyst_calendar",
  description: "Lịch vĩ mô sắp tới dưới dạng sự kiện xúc tác: ngày công bố số liệu VN (GSO, NHNN, PMI — ƯỚC TÍNH), họp FOMC (ngày chính thức), cảnh báo / chuyển chế độ vĩ mô (chỉ khi có số liệu thật). Dùng khi hỏi 'sắp có sự kiện vĩ mô gì'.",
  input_schema: { type: "object", properties: { horizonDays: { type: "integer", minimum: 1, maximum: 180, description: "Số ngày tới, mặc định 45." } }, required: [], additionalProperties: false },
};

export function buildToolList(macro: GatewayToolSpecs | null, world: WorldToolSpecs | null = null, ws: WorldToolSpecs | null = null, elite: WorldToolSpecs | null = null): BetaTool[] {
  const toTool = (t: { name: string; description: string; input_schema: Record<string, unknown> }): BetaTool => ({ name: t.name, description: t.description, input_schema: t.input_schema as BetaTool["input_schema"] });
  const macroTools: BetaTool[] = [...(elite?.anthropic ?? []), ...(ws?.anthropic ?? []), ...(macro?.anthropic ?? []), ...(world?.anthropic ?? [])].map(toTool);
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
    if (name.startsWith("world_") || name.startsWith("macro_") || name.startsWith("ws_") || name.startsWith("elite_")) {
      const base = name.startsWith("world_") ? "world" : name.startsWith("ws_") ? "world-sectors" : name.startsWith("elite_") ? "elite" : "macro";
      const res = await fetchImpl(`${MARKET_GATEWAY_URL}/api/${base}/tools/${encodeURIComponent(name)}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input ?? {}), signal: AbortSignal.timeout(60_000),
      });
      const label = base === "world" ? "Kết nối thế giới" : base === "world-sectors" ? "Ngành thế giới" : base === "elite" ? "Trung tâm quyết định Elite 10" : "Trung tâm vĩ mô";
      if (!res.ok) return { ok: false, error: res.status === 429 ? `${label} đang quá tải — thử lại sau.` : `${label} lỗi HTTP ${res.status}.` };
      return (await res.json()) as ChatToolResult;
    }
    return { ok: false, error: `Không có công cụ ${name}.` };
  };
}

export function buildSystemPrompt(macro: GatewayToolSpecs | null, todayVn: string, world: WorldToolSpecs | null = null, ws: WorldToolSpecs | null = null, elite: WorldToolSpecs | null = null, role: ChatRole | null = null): string {
  return [
    ...(role ? [ROLE_PROMPTS[role], ""] : []),
    `Bạn là trợ lý "Hỏi đáp xúc tác" trong ứng dụng phân tích chứng khoán Việt Nam. Hôm nay là ${todayVn} (giờ Việt Nam).`,
    "Nhiệm vụ: trả lời câu hỏi về chất xúc tác (tin tức, sự kiện, chính sách tác động tới ngành/mã), bối cảnh vĩ mô và tác động của thế giới tới ngành/cổ phiếu Việt Nam, CHỈ dựa trên kết quả công cụ.",
    "Khi hỏi về danh mục Elite 10, Điểm Elite, độ tin cậy của tín hiệu hay hồ sơ định lượng của một mã: dùng elite_decision / elite_ticker / elite_evidence trước.",
    "Cách phân tích một ngành hoặc một mã: (1) ws_stock / ws_sector để biết ngành ICB, tư thế ngắn hạn, bối cảnh trung hạn, hàng hoá dẫn dắt; (2) catalyst_* để xem tin/sự kiện tác động; (3) macro_* / world_* khi cần bối cảnh vĩ mô hay truyền dẫn. Kết luận theo thứ tự: tác động ngành -> tác động mã -> rủi ro / độ tin cậy.",
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
    "",
    world
      ? [
          "Công cụ Kết nối thế giới (world_*): yếu tố/sự kiện thế giới -> ngành Việt Nam, bậc bằng chứng A/B/C, kết nối thị trường, kịch bản.",
          "Mã ngành của world_*: S_BANK ngân hàng, S_SEC chứng khoán, S_RE bất động sản, S_STEEL thép, S_OIL dầu khí, S_SEAFOOD thuỷ sản, S_TEXTILE dệt may, S_PORT cảng & logistics, S_TECH công nghệ, S_POWER điện.",
          "Ánh xạ sang ngành ICB: S_BANK=8300, S_SEC=8700, S_RE=8600, S_STEEL=1750, S_OIL=0500, S_PORT=2770, S_TECH=9500, S_POWER=7530.",
          "PMI Mỹ dùng proxy Philly Fed, bất định thuế quan dùng EPU thương mại (FRED). Cước container, PMI Trung Quốc, dòng vốn EM CHƯA có nguồn — nếu kết quả báo bỏ qua/thiếu, nói rõ, không suy đoán.",
          world.guidelines,
        ].join("\n")
      : "Công cụ Kết nối thế giới hiện không khả dụng — nếu được hỏi về tác động của thế giới lên ngành, nói thật là không lấy được dữ liệu.",
    "",
    ws?.guidelines ?? "Công cụ ngành thế giới (ws_*) hiện không khả dụng.",
    "",
    elite?.guidelines ?? "Công cụ trung tâm quyết định Elite 10 (elite_*) hiện không khả dụng.",
  ].join("\n");
}
