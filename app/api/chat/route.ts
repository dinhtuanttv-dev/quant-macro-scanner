import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 30;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  try {
    const { message } = await request.json();
    if (!message) return NextResponse.json({ error: "Thieu message." }, { status: 400 });

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      messages: [{ role: "user", content: message }],
      system: "Ban la CIO phan tich chung khoan Viet Nam chuyen nghiep. Tra loi ngan gon, khach quan, bang tieng Viet. Khong dua ra loi khuyen dau tu cu the.",
    });

    const reply = response.content.find((c) => c.type === "text")?.text ?? "";
    return NextResponse.json({ reply });
  } catch (err) {
    console.error("[api/chat] Loi:", err);
    return NextResponse.json({ error: "Loi khi goi AI." }, { status: 500 });
  }
}
