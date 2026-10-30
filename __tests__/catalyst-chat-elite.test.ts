import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildToolList, createToolExecutor, ROLE_PROMPTS } from "@/lib/catalyst/chat/chatTools";

const elite = {
  anthropic: [{ name: "elite_ticker", description: "Hồ sơ 360°", input_schema: { type: "object", properties: { ticker: { type: "string" } }, required: ["ticker"] } }],
  guidelines: "Quy tắc công cụ elite_*: nhãn THĂM DÒ.", mode: "real", notice: null,
};

describe("E5 — Hỏi đáp dùng công cụ trung tâm quyết định Elite 10", () => {
  it("đưa elite_* lên đầu danh sách công cụ và thêm hướng dẫn vào system prompt", () => {
    const names = buildToolList(null, null, null, elite as never).map((t) => t.name);
    expect(names[0]).toBe("elite_ticker");
    const sp = buildSystemPrompt(null, "2026-10-17", null, null, elite as never);
    expect(sp).toContain("elite_decision / elite_ticker / elite_evidence");
    expect(sp).toContain("nhãn THĂM DÒ");
    expect(buildSystemPrompt(null, "2026-10-17")).toContain("elite_*) hiện không khả dụng");
  });

  it("vai trò tranh luận đứng đầu system prompt; không có vai trò thì không chèn", () => {
    const bull = buildSystemPrompt(null, "2026-10-17", null, null, elite as never, "bull");
    expect(bull.startsWith(ROLE_PROMPTS.bull)).toBe(true);
    expect(buildSystemPrompt(null, "2026-10-17", null, null, elite as never, "judge")).toContain("trọng tài độc lập");
    expect(buildSystemPrompt(null, "2026-10-17", null, null, elite as never)).not.toContain("VAI TRÒ:");
  });

  it("elite_* được chuyển tới Gateway /api/elite/tools/:name; lỗi HTTP báo đúng nguồn", async () => {
    const calls: string[] = [];
    const exec = createToolExecutor({
      fetchImpl: (async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method} ${url} ${init?.body}`);
        return url.includes("elite_decision")
          ? new Response("x", { status: 503 })
          : new Response(JSON.stringify({ ok: true, data: { ticker: "HPG" } }));
      }) as never,
    });
    expect(await exec("elite_ticker", { ticker: "HPG" })).toEqual({ ok: true, data: { ticker: "HPG" } });
    expect(calls[0]).toMatch(/^POST .*\/api\/elite\/tools\/elite_ticker \{"ticker":"HPG"\}$/);
    expect((await exec("elite_decision", {})).error).toContain("Trung tâm quyết định Elite 10");
  });
});
