import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { runChat, type ChatEvent, type StreamingMessages } from "@/lib/catalyst/chat/chatEngine";
import { runCatalystTool, type CatalystSnapshotLike } from "@/lib/catalyst/chat/catalystTools";
import { auditNumbers, readings } from "@/lib/catalyst/chat/numberAudit";
import { buildToolList, buildSystemPrompt, createToolExecutor } from "@/lib/catalyst/chat/chatTools";

// Model giả có kịch bản: mỗi lượt trả về một message dựng sẵn (text và/hoặc tool_use).
type Turn = { text?: string; tools?: { name: string; input: unknown }[]; stop?: string };
function fakeApi(turns: Turn[]) {
  const calls: Record<string, unknown>[] = [];
  let i = 0;
  const api: StreamingMessages = {
    stream(params) {
      calls.push(JSON.parse(JSON.stringify(params)) as Record<string, unknown>);
      const t = turns[Math.min(i++, turns.length - 1)];
      let onText: ((d: string) => void) | null = null;
      return {
        on(_e: "text", cb: (d: string) => void) {
          onText = cb;
          return this;
        },
        async finalMessage() {
          if (t.text) onText?.(t.text);
          const content = [
            ...(t.text ? [{ type: "text", text: t.text, citations: null }] : []),
            ...(t.tools ?? []).map((u, k) => ({ type: "tool_use", id: `tu_${i}_${k}`, name: u.name, input: u.input })),
          ];
          return { id: `m${i}`, type: "message", role: "assistant", model: "claude-opus-5-5", content, stop_reason: t.stop ?? (t.tools?.length ? "tool_use" : "end_turn"), stop_sequence: null, usage: {} } as never;
        },
      };
    },
  };
  return { api, calls };
}

const NOTICE = "DỮ LIỆU MÔ PHỎNG — không phải số liệu thực của GSO/NHNN/HOSE.";
const overview = { ok: true, notice: NOTICE, data: { thermometer: { value: -0.31, band: "Bất lợi nhẹ" }, usableForDecisions: false }, guidance: [] };

async function run(turns: Turn[], exec: (n: string, i: unknown) => Promise<unknown>, question = "Vĩ mô đang thuận lợi không?") {
  const events: ChatEvent[] = [];
  const { api, calls } = fakeApi(turns);
  const out = await runChat({ messages: [{ role: "user", content: question }], system: "S", tools: [], api, execTool: exec as never, emit: (e) => events.push(e) });
  return { events, calls, out };
}

describe("X4 — vòng lặp chat (model giả có kịch bản)", () => {
  it("G1 + G7: gọi macro_overview đúng 1 lần, phát notice trước câu trả lời, số liệu truy được -> không cảnh báo", async () => {
    const exec = vi.fn(async () => overview);
    const { events, calls } = await run([{ tools: [{ name: "macro_overview", input: { target: "VNINDEX" } }] }, { text: "DỮ LIỆU MÔ PHỎNG. Nhiệt kế -0,31 (Bất lợi nhẹ); chưa vượt kiểm định." }], exec);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith("macro_overview", { target: "VNINDEX" });
    const kinds = events.map((e) => e.type);
    expect(kinds.indexOf("notice")).toBeLessThan(kinds.indexOf("text"));
    expect(events.find((e) => e.type === "audit")).toBeUndefined();
    expect(events.at(-1)).toMatchObject({ type: "done", rounds: 1 });
    expect(calls[0]).toMatchObject({ model: "claude-opus-5-5", thinking: { type: "adaptive" }, fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] });
  });

  it("G6: công cụ lỗi -> tool_result is_error; số bịa trong câu trả lời bị kiểm toán bắt", async () => {
    const exec = vi.fn(async () => ({ ok: false, error: "Trung tâm vĩ mô lỗi HTTP 500." }));
    const { events, calls } = await run([{ tools: [{ name: "macro_overview", input: {} }] }, { text: "Không lấy được dữ liệu, nhưng CPI khoảng 3,7%." }], exec);
    const second = calls[1] as { messages: { role: string; content: unknown }[] };
    const tr = (second.messages.at(-1)!.content as { type: string; is_error: boolean }[])[0];
    expect(tr).toMatchObject({ type: "tool_result", is_error: true });
    expect(events.find((e) => e.type === "audit")).toMatchObject({ untraceable: ["3,7"] });
  });

  it("execTool ném lỗi -> chuyển thành kết quả ok:false, không sập luồng", async () => {
    const { events } = await run([{ tools: [{ name: "macro_report", input: {} }] }, { text: "Không lấy được báo cáo." }], async () => {
      throw new Error("timeout");
    });
    expect(events.find((e) => e.type === "tool_result")).toMatchObject({ result: { ok: false, error: "timeout" } });
    expect(events.at(-1)?.type).toBe("done");
  });

  it("giới hạn 4 vòng công cụ: vòng thứ 5 bị ép tool_choice none", async () => {
    const loop: Turn = { tools: [{ name: "catalyst_overview", input: {} }] };
    const { calls, events } = await run([loop, loop, loop, loop, { text: "Tóm tắt." }], async () => ({ ok: true, data: {} }));
    expect(calls).toHaveLength(5);
    expect(calls[4]).toMatchObject({ tool_choice: { type: "none" } });
    expect(events.at(-1)).toMatchObject({ type: "done", rounds: 4 });
  });

  it("refusal -> phát lỗi, không chạy công cụ", async () => {
    const exec = vi.fn();
    const { events } = await run([{ stop: "refusal" }], exec as never);
    expect(exec).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === "error")).toBe(true);
  });
});

describe("X4 — kiểm toán con số", () => {
  it("đọc số kiểu Việt/Anh", () => {
    expect(readings("3,5")).toContain(3.5);
    expect(readings("1.234,5")).toContain(1234.5);
  });
  it("chấp nhận số từ công cụ (kể cả tỷ lệ <-> %), câu hỏi, năm, số nhỏ; bắt số bịa", () => {
    const tools = [{ data: { hitRate: 0.62, beta: -3.48, ic: "0.041", date: "2026-10-16" } }];
    expect(auditNumbers("Tỷ lệ trúng 62%, hệ số -3,5, IC 0,04 trong 1 tháng; năm 2026; ngày 16/10.", tools, "")).toEqual([]);
    expect(auditNumbers("VN30 có thể tăng 12,8% trong 3 tháng.", tools, "")).toEqual(["12,8"]);
    expect(auditNumbers("Như bạn nói, 15% là ngưỡng.", tools, "ngưỡng 15% có ổn không")).toEqual([]);
  });
});

const card = { ticker: "KDH", sourceTitle: "Luật Đất đai sửa đổi", direction: "benefit" as const, netSignedImpact: 4.123, propagationDistance: "direct", horizon: "long", daysRemaining: null, corroborationCount: 2, historicalWinRate: 31, priceInStatus: "not_reflected", volumeFlag: "none", foreignFlowDirection: "none", compositeScore: 55.5, trustScore: 0.7, isConflicted: false };
const snap: CatalystSnapshotLike = {
  scannedAt: "2026-10-10T22:56:00Z", isStale: true, ageMinutes: 7200,
  sectors: [
    { sector: "Bat dong san", netScore: 7.2, tickerCount: 3, primaryCards: [card], cascadeCards: [] },
    { sector: "Ngan hang", netScore: -2, tickerCount: 1, primaryCards: [], cascadeCards: [] },
  ],
  upMovers: [{ rank: 1, ticker: "KDH", label: "x", compositeScore: 55.5 }],
  tickerImpacts: { KDH: { direction: "benefit", compositeScore: 55.5 } },
};

describe("X4 — công cụ xúc tác", () => {
  it("snapshot cũ -> notice; ngành tìm không dấu/có dấu; mã đọc thẻ", () => {
    const o = runCatalystTool("catalyst_overview", { topN: 3 }, snap);
    expect(o.ok).toBe(true);
    expect(o.notice).toMatch(/CŨ/);
    const s = runCatalystTool("catalyst_sector", { sector: "Bất động sản" }, snap);
    expect(s).toMatchObject({ ok: true, data: { sector: "Bat dong san" } });
    const t = runCatalystTool("catalyst_ticker", { ticker: "kdh" }, snap);
    expect(t).toMatchObject({ ok: true, data: { ticker: "KDH", found: true } });
    expect((t.data as { cards: { historicalWinRatePct: number }[] }).cards[0].historicalWinRatePct).toBe(31);
  });
  it("tham số sai / không có dữ liệu -> ok:false kèm danh sách hợp lệ", () => {
    expect(runCatalystTool("catalyst_ticker", { ticker: "!!" }, snap).ok).toBe(false);
    const bad = runCatalystTool("catalyst_sector", { sector: "Hàng không vũ trụ" }, snap);
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/Bat dong san/);
    expect(runCatalystTool("catalyst_overview", {}, null).ok).toBe(false);
  });
  it("danh sách công cụ: có catalyst + lịch, eager_input_streaming; system prompt cấm khuyến nghị", () => {
    const tools = buildToolList(null);
    expect(tools.map((t) => t.name)).toEqual(["macro_catalyst_calendar", "catalyst_overview", "catalyst_ticker", "catalyst_sector"]);
    expect(tools.every((t) => t.eager_input_streaming === true)).toBe(true);
    const sp = buildSystemPrompt(null, "2026-10-16");
    expect(sp).toMatch(/Không đưa khuyến nghị mua\/bán/);
    expect(sp).toMatch(/không lấy được dữ liệu/);
  });
});

describe("X4 — công cụ Kết nối thế giới (world_*)", () => {
  const world = {
    anthropic: [{ name: "world_links", description: "d", input_schema: { type: "object", properties: {} } }, { name: "world_events", description: "d", input_schema: { type: "object", properties: {} } }],
    guidelines: "Quy tắc bổ sung khi dùng công cụ world_*: không gọi bậc C là \"có tác động\"; sự kiện pending chưa đo được.",
    mode: "real" as const, notice: null,
  };
  it("danh sách công cụ + system prompt có quy tắc bậc A/B/C và yếu tố chưa có nguồn", () => {
    const tools = buildToolList(null, world);
    expect(tools.map((t) => t.name)).toEqual(["world_links", "world_events", "macro_catalyst_calendar", "catalyst_overview", "catalyst_ticker", "catalyst_sector"]);
    const sp = buildSystemPrompt(null, "2026-10-16", world);
    expect(sp).toMatch(/không gọi bậc C/);
    expect(sp).toMatch(/pending/);
    expect(sp).toMatch(/CHƯA có nguồn/);
    expect(sp).toMatch(/PMI Mỹ dùng proxy Philly Fed/);
    expect(sp).toMatch(/S_PORT cảng/);
    expect(buildSystemPrompt(null, "2026-10-16", null)).toMatch(/Kết nối thế giới hiện không khả dụng/);
  });
  it("world_* thực thi trên Gateway /api/world/tools/:name; lỗi HTTP -> ok:false có nhãn đúng", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return url.includes("world_events") ? new Response(JSON.stringify({ ok: true, data: { events: [{ id: "fomc-2025-09-17", tier: "C" }] } })) : new Response("x", { status: 503 });
    }) as unknown as typeof fetch;
    const exec = createToolExecutor({ getSnapshot: async () => null, fetchImpl });
    const ok = await exec("world_events", {});
    expect(ok).toMatchObject({ ok: true, data: { events: [{ tier: "C" }] } });
    expect(urls[0]).toMatch(/\/api\/world\/tools\/world_events$/);
    const bad = await exec("world_links", {});
    expect(bad).toEqual({ ok: false, error: "Kết nối thế giới lỗi HTTP 503." });
  });
});
