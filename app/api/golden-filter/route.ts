import { NextResponse } from "next/server";

export const maxDuration = 10;

export async function GET(request: Request) {
  const { origin } = new URL(request.url);

  const [patternRes, scoredRes] = await Promise.all([
    fetch(`${origin}/api/pattern-scan`, { cache: "no-store" }),
    fetch(`${origin}/api/scored-stocks?top=20`, { cache: "no-store" }),
  ]);

  if (!patternRes.ok || !scoredRes.ok) {
    return NextResponse.json({ error: "Khong the tai du lieu Golden Filter luc nay." }, { status: 502 });
  }

  const patternData = await patternRes.json();
  const scoredData = await scoredRes.json();

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    patternMatches: patternData.matches ?? [],
    top20Tech: scoredData.top20 ?? [],
    universeSource: patternData.universeSource ?? "FALLBACK_60",
  });
}