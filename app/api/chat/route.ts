import { NextRequest, NextResponse } from "next/server";

// This route runs server-side only. The ANTHROPIC_API_KEY never reaches the browser.
// Set it in Vercel: Project Settings -> Environment Variables -> ANTHROPIC_API_KEY

export async function POST(req: NextRequest) {
  try {
    const { message, context } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Missing 'message' field" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { reply: "Server chưa cấu hình ANTHROPIC_API_KEY. Vui lòng thêm biến môi trường này trong Vercel." },
        { status: 200 }
      );
    }

    const systemPrompt = `Bạn là trợ lý CIO AI cho app Global Quant-Macro & Market Scanner, hỗ trợ nhà đầu tư Việt Nam. Trả lời ngắn gọn, chuyên nghiệp, dùng tiếng Việt. ${
      context ? `Bối cảnh hiện tại: ${context}` : ""
    } Khi cần thông tin tin tức hoặc giá mới nhất, hãy dùng công cụ web_search.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: message }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", response.status, errText);
      return NextResponse.json(
        { reply: "Dịch vụ AI hiện không phản hồi. Vui lòng thử lại sau ít phút." },
        { status: 200 }
      );
    }

    const data = await response.json();

    type ContentBlock = { type: string; text?: string };
    const textBlocks: string[] = (data.content || [])
      .filter((b: ContentBlock) => b.type === "text")
      .map((b: ContentBlock) => b.text || "");

    const replyText = textBlocks.join("\n").trim() || "Xin lỗi, tôi không nhận được phản hồi hợp lệ.";

    return NextResponse.json({ reply: replyText });
  } catch (err) {
    console.error("Chat API route error:", err);
    return NextResponse.json(
      { reply: "Đã xảy ra lỗi khi xử lý yêu cầu. Vui lòng thử lại." },
      { status: 200 }
    );
  }
}