// X4 — POST /api/catalysts/chat: "Hỏi đáp vĩ mô & thị trường" (Claude hoặc Gemini + công cụ vĩ mô/thế giới), trả về luồng SSE.
// Z2 (2026-10-17): body.provider = "claude" (mặc định) | "gemini" — cùng bộ công cụ, cùng kiểm tra con số.
// Bảo vệ chi phí: cần đăng nhập (token Gateway ĐINH TUẤN, kiểm qua JWKS — lib/catalyst/chat/gqAuth.ts) + hạn mức theo người dùng/ngày
// (Upstash). Không lưu nội dung hội thoại; log chỉ ghi tên công cụ, thời gian, ok.
import { createHash } from "node:crypto";
import { createGqVerifier } from "@/lib/catalyst/chat/gqAuth";
import Anthropic from "@anthropic-ai/sdk";
import { FunctionCallingMode, GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_CHAT_MODEL, runChatGemini, type GeminiChatLike, type GeminiModelFactory } from "@/lib/catalyst/chat/geminiEngine";
import { Redis } from "@upstash/redis";
import { runChat, type ChatEvent } from "@/lib/catalyst/chat/chatEngine";
import { buildSystemPrompt, buildToolList, createToolExecutor, fetchEliteToolSpecs, fetchMacroToolSpecs, fetchWorldToolSpecs, fetchWsToolSpecs, type ChatRole } from "@/lib/catalyst/chat/chatTools";

export const runtime = "nodejs";
export const maxDuration = 120;

const DAILY_LIMIT = Number(process.env.CATALYST_CHAT_DAILY_LIMIT || 40);
const MAX_MESSAGES = 20;
const MAX_CHARS = 2000;

const redis = new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json; charset=utf-8" } });

// Đăng nhập đã chuyển sang Gateway (Railway) ngày 23/10/2026: kiểm JWT Ed25519 bằng JWKS của Gateway (GQ_GATEWAY_URL).
const verifyUser = createGqVerifier();

const vnToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

type InMsg = { role: "user" | "assistant"; content: string };
function parseMessages(body: unknown): InMsg[] | string {
  const list = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(list) || list.length === 0) return "Thiếu messages.";
  const msgs = list.slice(-MAX_MESSAGES);
  for (const m of msgs) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string" || !m.content.trim()) return "messages không hợp lệ.";
    if (m.content.length > MAX_CHARS * (m.role === "assistant" ? 4 : 1)) return `Mỗi câu hỏi tối đa ${MAX_CHARS} ký tự.`;
  }
  // API yêu cầu bắt đầu bằng user và xen kẽ
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return "Tin nhắn cuối phải là câu hỏi của người dùng.";
  for (let i = 1; i < msgs.length; i++) if (msgs[i].role === msgs[i - 1].role) return "messages phải xen kẽ user/assistant.";
  return msgs as InMsg[];
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** Gemini SDK -> GeminiModelFactory (engine thuần). Vòng cuối tắt gọi công cụ (FunctionCallingMode.NONE). */
function geminiFactory(apiKey: string): GeminiModelFactory {
  const genAI = new GoogleGenerativeAI(apiKey);
  return {
    startChat: ({ history, systemInstruction, tools, lastRound }) => genAI.getGenerativeModel({
      model: GEMINI_CHAT_MODEL, systemInstruction,
      ...(tools.length ? { tools: tools as never } : {}),
      ...(lastRound && tools.length ? { toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.NONE } } } : {}),
      generationConfig: { temperature: 0.3 },
    }).startChat({ history: history as never }) as unknown as GeminiChatLike,
  };
}

export async function POST(request: Request) {
  const raw = await request.json().catch(() => null);
  const provider = (raw as { provider?: unknown })?.provider === "gemini" ? "gemini" : "claude";
  // E5: vai trò tranh luận (Phòng họp AI Elite 10) — chỉ nhận giá trị trong danh sách.
  const rawRole = (raw as { role?: unknown })?.role;
  const role: ChatRole | null = rawRole === "bull" || rawRole === "bear" || rawRole === "judge" ? rawRole : null;
  if (provider === "claude" && !process.env.ANTHROPIC_API_KEY) return json(503, { error: "Chưa cấu hình mô hình Claude." });
  if (provider === "gemini" && !process.env.GEMINI_API_KEY) return json(503, { error: "Chưa cấu hình mô hình Gemini." });
  const userId = await verifyUser(request.headers.get("authorization")).catch(() => null);
  if (!userId) return json(401, { error: "Cần đăng nhập để dùng Hỏi đáp xúc tác." });

  const parsed = parseMessages(raw);
  if (typeof parsed === "string") return json(400, { error: parsed });

  const quotaKey = `chat:xuctac:${createHash("sha256").update(userId).digest("hex").slice(0, 16)}:${vnToday()}`;
  let used = 0;
  try {
    used = await redis.incr(quotaKey);
    if (used === 1) await redis.expire(quotaKey, 2 * 86_400);
  } catch {
    // Upstash lỗi: vẫn phục vụ (không chặn người dùng vì hạ tầng hạn mức), nhưng không đếm
  }
  if (used > DAILY_LIMIT) return json(429, { error: `Đã dùng hết ${DAILY_LIMIT} câu hỏi hôm nay — quay lại ngày mai.` });

  const [macro, world, ws, elite] = await Promise.all([fetchMacroToolSpecs(), fetchWorldToolSpecs(), fetchWsToolSpecs(), fetchEliteToolSpecs()]);
  const tools = buildToolList(macro, world, ws, elite);
  const execTool = createToolExecutor();

  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ChatEvent | { type: "meta"; remaining: number; macroMode: string | null; worldMode: string | null; provider: string; model: string }) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          // client đã đóng
        }
      };
      send({ type: "meta", remaining: Math.max(0, DAILY_LIMIT - used), macroMode: macro?.mode ?? null, worldMode: world?.mode ?? null, provider, model: provider === "gemini" ? GEMINI_CHAT_MODEL : "claude-opus-5-5" });
      const system = buildSystemPrompt(macro, vnToday(), world, ws, elite, role);
      const tracedExec = async (name: string, input: unknown) => {
        const t = Date.now();
        const r = await execTool(name, input);
        console.log(`[catalyst-chat] provider=${provider} tool=${name} ok=${r.ok} ms=${Date.now() - t}`);
        return r;
      };
      const t0 = Date.now();
      try {
        if (provider === "gemini") {
          await runChatGemini({ messages: parsed, system, tools: tools as never, model: geminiFactory(process.env.GEMINI_API_KEY!), signal: request.signal, execTool: tracedExec, emit: send });
        } else {
          await runChat({ messages: parsed, system, tools, api: anthropic.beta.messages, signal: request.signal, execTool: tracedExec, emit: send });
        }
      } catch (e) {
        const message = provider === "gemini" ? (request.signal.aborted ? "Đã huỷ." : `Lỗi Gemini: ${e instanceof Error ? e.message.slice(0, 160) : "không rõ"}`)
          : e instanceof Anthropic.RateLimitError ? "Mô hình AI đang quá tải — thử lại sau ít phút."
          : e instanceof Anthropic.APIError ? `Lỗi mô hình AI (HTTP ${e.status ?? "?"}).`
          : request.signal.aborted ? "Đã huỷ." : "Lỗi khi trả lời.";
        console.error("[catalyst-chat] lỗi:", e instanceof Error ? e.message : e);
        send({ type: "error", message });
      } finally {
        console.log(`[catalyst-chat] done ms=${Date.now() - t0}`);
        try {
          controller.close();
        } catch {
          // đã đóng
        }
      }
    },
  });

  return new Response(body, { headers: { ...CORS, "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
