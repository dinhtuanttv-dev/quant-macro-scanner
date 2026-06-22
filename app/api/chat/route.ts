import { NextRequest, NextResponse } from "next/server";

// Next.js API Route (Serverless Function) - tuan thu nguyen tac:
// - Khong hardcode API key, luon doc tu process.env
// - Khong dieu khien tu client, key khong bao gio gui ve browser
//
// Yeu cau bien moi truong trong .env (KHONG commit file nay):
//   ANTHROPIC_API_KEY=sk-ant-...

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error("[api/chat] Thieu bien moi truong ANTHROPIC_API_KEY");
    return NextResponse.json(
      { error: "Server chua duoc cau hinh API key. Vui long lien he quan tri vien." },
      { status: 500 }
    );
  }

  let body: { message?: string; contextSummary?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Du lieu gui len khong hop le." }, { status: 400 });
  }

  const { message, contextSummary } = body;
  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "Thieu noi dung tin nhan." }, { status: 400 });
  }

  try {
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
        system: `Ban la tro ly CIO AI cho app Global Quant-Macro & Market Scanner, ho tro nha dau tu Viet Nam. Tra loi ngan gon, chuyen nghiep, dung tieng Viet. ${contextSummary ?? ""}`,
        messages: [{ role: "user", content: message }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[api/chat] Anthropic API loi:", response.status, errText);
      return NextResponse.json({ error: "Dich vu AI tam thoi khong phan hoi. Vui long thu lai." }, { status: 502 });
    }

    const data = await response.json();
    const textBlocks = (data.content || [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text);
    const replyText = textBlocks.join("\n").trim() || "Xin loi, toi khong nhan duoc phan hoi hop le.";

    return NextResponse.json({ reply: replyText });
  } catch (err) {
    console.error("[api/chat] Loi khong xac dinh:", err);
    return NextResponse.json({ error: "Khong the ket noi toi dich vu AI luc nay." }, { status: 500 });
  }
}