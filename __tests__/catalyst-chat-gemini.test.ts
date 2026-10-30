import { describe, expect, it } from "vitest";
import { runChatGemini, toGeminiSchema, toGeminiTools, type GeminiModelFactory, type GeminiPart } from "@/lib/catalyst/chat/geminiEngine";
import { buildToolList, createToolExecutor } from "@/lib/catalyst/chat/chatTools";
import type { ChatEvent } from "@/lib/catalyst/chat/chatEngine";

/** Model giả: mỗi lượt trả về chữ + (tuỳ kịch bản) lời gọi công cụ. */
function fakeModel(script: { text: string; calls?: { name: string; args?: Record<string, unknown> }[] }[], seen: { sent: (string | GeminiPart[])[]; starts: { lastRound: boolean; tools: number }[] }): GeminiModelFactory {
  let i = 0;
  return {
    startChat: ({ lastRound, tools }) => {
      seen.starts.push({ lastRound, tools: tools.length });
      return {
        async sendMessageStream(parts) {
          seen.sent.push(parts);
          const step = script[Math.min(i++, script.length - 1)];
          return {
            stream: (async function* () { yield { text: () => step.text }; })(),
            response: Promise.resolve({ functionCalls: () => step.calls, text: () => step.text }),
          };
        },
      };
    },
  };
}

describe("Hỏi đáp xúc tác × Gemini (Z2)", () => {
  it("chuyển schema: bỏ additionalProperties/minimum, giữ enum/required/items; công cụ không tham số không có parameters", () => {
    const s = toGeminiSchema({ type: "object", properties: { icb: { type: "string", enum: ["8300"] }, n: { type: "integer", minimum: 1, maximum: 5 }, ids: { type: "array", items: { type: "string" } } }, required: ["icb"], additionalProperties: false });
    expect(s).toEqual({ type: "object", properties: { icb: { type: "string", enum: ["8300"] }, n: { type: "integer" }, ids: { type: "array", items: { type: "string" } } }, required: ["icb"] });
    const t = toGeminiTools([{ name: "a", description: "d", input_schema: { type: "object", properties: {}, required: [] } }]);
    expect(t[0].functionDeclarations[0]).toEqual({ name: "a", description: "d" });
  });

  it("vòng gọi công cụ: phát tool_call/tool_result, gửi functionResponse, trả lời cuối, kiểm tra con số", async () => {
    const seen = { sent: [] as (string | GeminiPart[])[], starts: [] as { lastRound: boolean; tools: number }[] };
    const events: ChatEvent[] = [];
    const model = fakeModel([
      { text: "", calls: [{ name: "ws_stock", args: { ticker: "HPG" } }] },
      { text: "HPG thuộc Kim loại công nghiệp, α +3,5 đcb; con số bịa 777." },
    ], seen);
    const r = await runChatGemini({
      messages: [{ role: "user", content: "HPG chịu tác động thế giới thế nào?" }], system: "sys", tools: [{ name: "ws_stock", description: "d", input_schema: { type: "object", properties: { ticker: { type: "string" } }, required: ["ticker"] } }],
      execTool: async () => ({ ok: true, data: { alphaBps: 3.5 } }), emit: (e) => events.push(e), model,
    });
    expect(events.map((e) => e.type)).toEqual(["tool_call", "tool_result", "text", "audit", "done"]);
    expect((seen.sent[1] as GeminiPart[])[0].functionResponse?.name).toBe("ws_stock");
    expect(r.text).toContain("Kim loại");
    const audit = events.find((e) => e.type === "audit") as { untraceable: string[] };
    expect(audit.untraceable.join(" ")).toContain("777");
  });

  it("hết lượt công cụ -> phiên mới tắt công cụ, trả lời bằng dữ liệu đã có", async () => {
    const seen = { sent: [] as (string | GeminiPart[])[], starts: [] as { lastRound: boolean; tools: number }[] };
    const loop = { text: "", calls: [{ name: "ws_strategy", args: {} }] };
    const model = fakeModel([loop, loop, { text: "Kết luận." }], seen);
    await runChatGemini({ messages: [{ role: "user", content: "q" }], system: "s", tools: [], maxRounds: 1, execTool: async () => ({ ok: true, data: {} }), emit: () => {}, model });
    expect(seen.starts.at(-1)).toEqual({ lastRound: true, tools: 0 });
  });

  it("công cụ ws_* được đưa vào danh sách và định tuyến tới Gateway /api/world-sectors/tools", async () => {
    const ws = { anthropic: [{ name: "ws_stock", description: "x", input_schema: { type: "object", properties: {} } }], guidelines: "g", mode: "real" as const, notice: null };
    expect(buildToolList(null, null, ws).map((t) => t.name)).toContain("ws_stock");
    const urls: string[] = [];
    const exec = createToolExecutor({ fetchImpl: (async (u: string) => { urls.push(u); return new Response(JSON.stringify({ ok: true, data: {} })); }) as unknown as typeof fetch });
    await exec("ws_stock", { ticker: "HPG" });
    expect(urls[0]).toMatch(/\/api\/world-sectors\/tools\/ws_stock$/);
  });
});
