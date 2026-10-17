// Z2 — Vòng lặp gọi công cụ của "Hỏi đáp xúc tác" với Gemini (function calling, streaming). Cùng sự kiện (ChatEvent), cùng bộ công
// cụ, cùng giới hạn vòng và cùng kiểm tra con số (numberAudit) như engine Claude (chatEngine.ts) -> giao diện dùng chung.
// Thuần: model được truyền vào (test bằng model giả có kịch bản).
import type { ChatEvent } from "./chatEngine";
import { auditNumbers } from "./numberAudit";
import type { ChatToolResult } from "./catalystTools";

export const GEMINI_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || "gemini-3.6-flash";
export const GEMINI_MAX_TOOL_ROUNDS = 4;

type Json = Record<string, unknown>;
export interface GeminiPart { text?: string; functionCall?: { name: string; args?: Json }; functionResponse?: { name: string; response: Json } }
export interface GeminiContent { role: "user" | "model" | "function"; parts: GeminiPart[] }
/** Phần SDK mà engine dùng (@google/generative-ai ChatSession) — test truyền bản giả. */
export interface GeminiChatLike {
  sendMessageStream(parts: string | GeminiPart[]): Promise<{
    stream: AsyncIterable<{ text(): string }>;
    response: Promise<{ functionCalls(): { name: string; args?: Json }[] | undefined; text(): string }>;
  }>;
}
export interface GeminiModelFactory {
  startChat(opts: { history: GeminiContent[]; systemInstruction: string; tools: { functionDeclarations: Json[] }[]; lastRound: boolean }): GeminiChatLike;
}

/** JSON Schema của công cụ -> tập con OpenAPI mà Gemini chấp nhận (bỏ additionalProperties, minimum/maximum…; kiểm tra lại phía server). */
export function toGeminiSchema(s: unknown): Json | undefined {
  if (!s || typeof s !== "object") return undefined;
  const src = s as Json;
  const out: Json = {};
  if (typeof src.type === "string") out.type = src.type;
  if (typeof src.description === "string") out.description = src.description;
  if (Array.isArray(src.enum)) out.enum = src.enum.map(String);
  if (src.items) out.items = toGeminiSchema(src.items);
  if (src.properties && typeof src.properties === "object") {
    out.properties = Object.fromEntries(Object.entries(src.properties as Json).map(([k, v]) => [k, toGeminiSchema(v) ?? { type: "string" }]));
    if (Array.isArray(src.required) && src.required.length) out.required = src.required;
  }
  return out;
}

export function toGeminiTools(tools: { name: string; description: string; input_schema: unknown }[]): { functionDeclarations: Json[] }[] {
  return [{
    functionDeclarations: tools.map((t) => {
      const params = toGeminiSchema(t.input_schema);
      const hasProps = params?.properties && Object.keys(params.properties as Json).length > 0;
      return { name: t.name, description: t.description, ...(hasProps ? { parameters: params } : {}) };
    }),
  }];
}

export interface RunGeminiOptions {
  messages: { role: "user" | "assistant"; content: string }[];
  system: string;
  tools: { name: string; description: string; input_schema: unknown }[];
  execTool: (name: string, input: unknown) => Promise<ChatToolResult>;
  emit: (e: ChatEvent) => void;
  model: GeminiModelFactory;
  modelName?: string;
  maxRounds?: number;
  signal?: AbortSignal;
}

export async function runChatGemini(o: RunGeminiOptions): Promise<{ text: string; toolResults: ChatToolResult[] }> {
  const maxRounds = o.maxRounds ?? GEMINI_MAX_TOOL_ROUNDS;
  const prior = o.messages.slice(0, -1).map((m): GeminiContent => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const question = o.messages[o.messages.length - 1].content;
  const gTools = toGeminiTools(o.tools);
  const results: ChatToolResult[] = [];
  const notices = new Set<string>();
  let finalText = "", rounds = 0;
  let chat = o.model.startChat({ history: prior, systemInstruction: o.system, tools: gTools, lastRound: false });
  let next: string | GeminiPart[] = question;
  let callId = 0;
  while (true) {
    if (o.signal?.aborted) throw new Error("aborted");
    const res = await chat.sendMessageStream(next);
    for await (const chunk of res.stream) {
      const t = chunk.text();
      if (t) { finalText += t; o.emit({ type: "text", delta: t }); }
    }
    const response = await res.response;
    const calls = response.functionCalls() ?? [];
    if (!calls.length) break;
    if (rounds >= maxRounds) {
      // hết lượt: yêu cầu trả lời bằng dữ liệu đã có (phiên mới, không công cụ)
      chat = o.model.startChat({ history: [...prior, { role: "user", parts: [{ text: question }] }], systemInstruction: `${o.system}\n\nĐã hết lượt gọi công cụ: trả lời ngay bằng dữ liệu đã có ở dưới, nói rõ phần nào chưa lấy được.`, tools: [], lastRound: true });
      next = `Kết quả công cụ đã có:\n${JSON.stringify(results).slice(0, 60_000)}`;
      rounds++;
      if (rounds > maxRounds + 1) break;
      continue;
    }
    rounds++;
    const parts: GeminiPart[] = await Promise.all(calls.map(async (c) => {
      const id = `g${++callId}`;
      o.emit({ type: "tool_call", id, name: c.name, input: c.args ?? {} });
      let r: ChatToolResult;
      try { r = await o.execTool(c.name, c.args ?? {}); } catch (e) { r = { ok: false, error: e instanceof Error ? e.message : "Lỗi khi chạy công cụ." }; }
      results.push(r);
      if (r.ok && r.notice && !notices.has(r.notice)) { notices.add(r.notice); o.emit({ type: "notice", notice: r.notice }); }
      o.emit({ type: "tool_result", id, name: c.name, result: r });
      return { functionResponse: { name: c.name, response: { result: r as unknown as Json } } };
    }));
    next = parts;
  }
  const userText = o.messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
  const untraceable = auditNumbers(finalText, results, userText);
  if (untraceable.length) o.emit({ type: "audit", untraceable });
  o.emit({ type: "done", stopReason: "end_turn", model: o.modelName ?? GEMINI_CHAT_MODEL, rounds, fallback: false });
  return { text: finalText, toolResults: results };
}
