// X4 — Vòng lặp tool-use của "Hỏi đáp xúc tác" (Claude, streaming). Thuần: client, công cụ, nơi phát sự kiện đều được
// truyền vào -> test bằng model giả có kịch bản (tiêu chí G1–G9 của gói MacroCenter) mà không gọi API thật.
import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaMessage, BetaMessageParam, BetaToolResultBlockParam, BetaToolUseBlock, BetaToolUnion, MessageCreateParamsStreaming,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { auditNumbers } from "./numberAudit";
import type { ChatToolResult } from "./catalystTools";

export const CHAT_MODEL = "claude-opus-5-5";
export const MAX_TOOL_ROUNDS = 4;

export type ChatEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; name: string; result: ChatToolResult }
  | { type: "notice"; notice: string }
  | { type: "audit"; untraceable: string[] }
  | { type: "done"; stopReason: string | null; model: string; rounds: number; fallback: boolean }
  | { type: "error"; message: string };

/** Phần client mà engine dùng — `client.beta.messages` của SDK thoả mãn; test truyền bản giả. */
export interface StreamingMessages {
  stream(params: MessageCreateParamsStreaming): { on(event: "text", cb: (delta: string) => void): unknown; finalMessage(): Promise<BetaMessage> };
}

export interface RunChatOptions {
  messages: { role: "user" | "assistant"; content: string }[];
  system: string;
  tools: BetaToolUnion[];
  execTool: (name: string, input: unknown) => Promise<ChatToolResult>;
  emit: (e: ChatEvent) => void;
  api: StreamingMessages;
  model?: string;
  maxRounds?: number;
  signal?: AbortSignal;
}

const toolErr = (message: string): ChatToolResult => ({ ok: false, error: message });

export async function runChat(o: RunChatOptions): Promise<{ text: string; toolResults: ChatToolResult[] }> {
  const model = o.model ?? CHAT_MODEL;
  const maxRounds = o.maxRounds ?? MAX_TOOL_ROUNDS;
  const history: BetaMessageParam[] = o.messages.map((m) => ({ role: m.role, content: m.content }));
  const results: ChatToolResult[] = [];
  const notices = new Set<string>();
  let finalText = "";
  let rounds = 0;
  let fallback = false;
  let last: BetaMessage | null = null;

  while (true) {
    if (o.signal?.aborted) throw new Error("aborted");
    const lastRound = rounds >= maxRounds;
    const stream = o.api.stream({
      model,
      max_tokens: 16000,
      system: lastRound ? `${o.system}\n\nĐã hết lượt gọi công cụ cho câu hỏi này: trả lời ngay bằng dữ liệu đã có, nói rõ phần nào chưa lấy được.` : o.system,
      tools: o.tools,
      tool_choice: lastRound ? { type: "none" } : { type: "auto" },
      messages: history,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      cache_control: { type: "ephemeral" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      stream: true,
    });
    let roundText = "";
    stream.on("text", (delta) => {
      roundText += delta;
      o.emit({ type: "text", delta });
    });
    const msg = await stream.finalMessage();
    last = msg;
    finalText += roundText;
    if ((msg.usage as { iterations?: { type: string }[] } | undefined)?.iterations?.some((x) => x.type === "fallback_message")) fallback = true;

    if (msg.stop_reason === "refusal") {
      o.emit({ type: "error", message: "Mô hình từ chối trả lời câu hỏi này." });
      break;
    }
    if (msg.stop_reason === "pause_turn") {
      history.push({ role: "assistant", content: msg.content });
      continue;
    }
    const uses = msg.content.filter((b): b is BetaToolUseBlock => b.type === "tool_use");
    if (msg.stop_reason !== "tool_use" || uses.length === 0) break;

    history.push({ role: "assistant", content: msg.content });
    rounds++;
    const out: BetaToolResultBlockParam[] = await Promise.all(
      uses.map(async (u) => {
        o.emit({ type: "tool_call", id: u.id, name: u.name, input: u.input });
        let r: ChatToolResult;
        try {
          r = await o.execTool(u.name, u.input);
        } catch (e) {
          r = toolErr(e instanceof Error ? e.message : "Lỗi khi chạy công cụ.");
        }
        results.push(r);
        if (r.ok && r.notice && !notices.has(r.notice)) {
          notices.add(r.notice);
          o.emit({ type: "notice", notice: r.notice });
        }
        o.emit({ type: "tool_result", id: u.id, name: u.name, result: r });
        return { type: "tool_result", tool_use_id: u.id, content: JSON.stringify(r), is_error: !r.ok };
      }),
    );
    history.push({ role: "user", content: out });
  }

  const userText = o.messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
  const untraceable = auditNumbers(finalText, results, userText);
  if (untraceable.length) o.emit({ type: "audit", untraceable });
  o.emit({ type: "done", stopReason: last?.stop_reason ?? null, model: last?.model ?? model, rounds, fallback });
  return { text: finalText, toolResults: results };
}

export function isAnthropicApiError(e: unknown): e is InstanceType<typeof Anthropic.APIError> {
  return e instanceof Anthropic.APIError;
}
