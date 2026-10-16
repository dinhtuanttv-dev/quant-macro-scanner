// X4 — POST /api/catalysts/chat: "Hỏi đáp xúc tác" (Claude + công cụ vĩ mô/xúc tác), trả về luồng SSE.
// Bảo vệ chi phí: cần đăng nhập (phiên Supabase của Global Quanta, xác minh qua GQ_SUPABASE_URL) + hạn mức theo người dùng/ngày
// (Upstash). Không lưu nội dung hội thoại; log chỉ ghi tên công cụ, thời gian, ok.
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { Redis } from "@upstash/redis";
import { readSnapshotWithStaleness } from "@/lib/catalyst/engine/SnapshotStore";
import { sanitizeLegacySnapshot } from "@/lib/catalyst/provenance";
import { runChat, type ChatEvent } from "@/lib/catalyst/chat/chatEngine";
import { buildSystemPrompt, buildToolList, createToolExecutor, fetchMacroToolSpecs } from "@/lib/catalyst/chat/chatTools";
import type { CatalystSnapshotLike } from "@/lib/catalyst/chat/catalystTools";

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

const authCache = new Map<string, { userId: string; exp: number }>();
async function verifyUser(authorization: string | null): Promise<string | null> {
  const token = /^Bearer\s+(.+)$/i.exec(authorization ?? "")?.[1]?.trim();
  const url = (process.env.GQ_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.GQ_SUPABASE_PUBLISHABLE_KEY || "";
  if (!token || !url || !key) return null;
  const h = createHash("sha256").update(token).digest("hex");
  const hit = authCache.get(h);
  if (hit && hit.exp > Date.now()) return hit.userId;
  const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  const u = (await res.json()) as { id?: string };
  if (!u.id) return null;
  authCache.set(h, { userId: u.id, exp: Date.now() + 5 * 60_000 });
  if (authCache.size > 1000) authCache.delete(authCache.keys().next().value as string);
  return u.id;
}

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

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return json(503, { error: "Chưa cấu hình mô hình AI." });
  const userId = await verifyUser(request.headers.get("authorization")).catch(() => null);
  if (!userId) return json(401, { error: "Cần đăng nhập để dùng Hỏi đáp xúc tác." });

  const parsed = parseMessages(await request.json().catch(() => null));
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

  const macro = await fetchMacroToolSpecs();
  const tools = buildToolList(macro);
  const execTool = createToolExecutor({
    getSnapshot: async () => {
      const r = await readSnapshotWithStaleness<CatalystSnapshotLike>(redis);
      return r.snapshot ? { ...sanitizeLegacySnapshot(r.snapshot as Parameters<typeof sanitizeLegacySnapshot>[0]), isStale: r.isStale, ageMinutes: r.ageMinutes ?? undefined } as CatalystSnapshotLike : null;
    },
  });

  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ChatEvent | { type: "meta"; remaining: number; macroMode: string | null }) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          // client đã đóng
        }
      };
      send({ type: "meta", remaining: Math.max(0, DAILY_LIMIT - used), macroMode: macro?.mode ?? null });
      const t0 = Date.now();
      try {
        await runChat({
          messages: parsed, system: buildSystemPrompt(macro, vnToday()), tools,
          api: anthropic.beta.messages, signal: request.signal,
          execTool: async (name, input) => {
            const t = Date.now();
            const r = await execTool(name, input);
            console.log(`[catalyst-chat] tool=${name} ok=${r.ok} ms=${Date.now() - t}`);
            return r;
          },
          emit: send,
        });
      } catch (e) {
        const message = e instanceof Anthropic.RateLimitError ? "Mô hình AI đang quá tải — thử lại sau ít phút."
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
