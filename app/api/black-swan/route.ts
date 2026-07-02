import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const maxDuration = 10;

export interface BlackSwanScenario {
  event: string;
  channel: string;
  impact: string;
  severity: "low" | "medium" | "high" | "critical";
  sourceHeadlines: string[];
  generatedAt: string;
}

export interface BlackSwanResponse {
  scenarios: BlackSwanScenario[];
  generatedAt: string;
  isAiGenerated: boolean;
  newsCount: number;
}

// Fallback data mau khi khong co AI hoac khong co tin tuc
const FALLBACK_SCENARIOS: BlackSwanScenario[] = [
  {
    event: "FED bat dau ha lai suat cham hon ky vong",
    channel: "DXY duy tri suc manh -> Ap luc ty gia USD/VND -> SBV phai giu lai suat cao",
    impact: "Tieu cuc cho nganh BDS & Chung khoan, Tich cuc nhe cho Xuat khau",
    severity: "high",
    sourceHeadlines: [],
    generatedAt: new Date().toISOString(),
  },
  {
    event: "Gia dau Brent leo doc vuot moc $85/thung",
    channel: "Chi phi van tai tang -> Lam phat nhap khau -> Bien loi nhuan bien thu hep",
    impact: "Huong loi truc tiep: Dau khi. Bat loi: Van tai, Thuy san",
    severity: "medium",
    sourceHeadlines: [],
    generatedAt: new Date().toISOString(),
  },
  {
    event: "Cang thang dia chinh tri Bien Do leo thang",
    channel: "Gia cuoc container tang vot -> Thoi gian giao hang keo dai",
    impact: "Huong loi dot bien: Van tai bien. Bat loi: Xuat khau go, det may",
    severity: "high",
    sourceHeadlines: [],
    generatedAt: new Date().toISOString(),
  },
];

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  try {
    // Lay tin tuc macro moi nhat tu DB (toi da 20 tin gan nhat)
    const recentNews = await prisma.macroNewsRecord.findMany({
      orderBy: { publishedAt: "desc" },
      take: 20,
      select: {
        headline: true,
        sourceName: true,
        scope: true,
        rawImpact: true,
        affectedSectors: true,
        publishedAt: true,
      },
    });

    // Neu khong co API key hoac khong co tin tuc -> dung fallback
    if (!apiKey || recentNews.length === 0) {
      return NextResponse.json({
        scenarios: FALLBACK_SCENARIOS,
        generatedAt: new Date().toISOString(),
        isAiGenerated: false,
        newsCount: recentNews.length,
      } as BlackSwanResponse);
    }

    // Chuan bi prompt cho Claude AI
    const newsText = recentNews
      .slice(0, 10)
      .map((n, i) => `${i + 1}. [${n.sourceName}] ${n.headline} (Impact: ${n.rawImpact}/10, Nganh: ${n.affectedSectors?.join(", ") ?? "chung"})`)
      .join("\n");

    const prompt = `Dua vao danh sach tin tuc vi mo moi nhat duoi day, hay xac dinh DUNG 3 kich ban rui ro (Black Swan) nghiem trong nhat co the anh huong den thi truong chung khoan Viet Nam trong 1-4 tuan toi.

TIN TUC MOI NHAT:
${newsText}

Tra loi DUNG DINH DANG JSON sau (khong them text khac):
{
  "scenarios": [
    {
      "event": "Ten su kien rui ro ngan gon (toi da 15 tu)",
      "channel": "Co che truyen dan: A -> B -> C (toi da 20 tu)",
      "impact": "Nganh huong loi / nganh bat loi cu the (toi da 20 tu)",
      "severity": "low|medium|high|critical",
      "sourceHeadlines": ["headline 1", "headline 2"]
    }
  ]
}

Chi tao 3 kich ban, xep tu nghiem trong nhat den it nghiem trong nhat.`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      throw new Error(`Claude API loi ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    const rawText = aiData.content
      ?.filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("") ?? "";

    // Parse JSON tu response AI
    const cleanText = rawText.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleanText);

    const scenarios: BlackSwanScenario[] = (parsed.scenarios ?? [])
      .slice(0, 3)
      .map((s: Omit<BlackSwanScenario, "generatedAt">) => ({
        ...s,
        generatedAt: new Date().toISOString(),
      }));

    return NextResponse.json({
      scenarios: scenarios.length > 0 ? scenarios : FALLBACK_SCENARIOS,
      generatedAt: new Date().toISOString(),
      isAiGenerated: true,
      newsCount: recentNews.length,
    } as BlackSwanResponse);

  } catch (err) {
    console.error("[api/black-swan] Loi:", err);
    // Fallback an toan khi loi
    return NextResponse.json({
      scenarios: FALLBACK_SCENARIOS,
      generatedAt: new Date().toISOString(),
      isAiGenerated: false,
      newsCount: 0,
    } as BlackSwanResponse);
  }
}