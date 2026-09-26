import { NextResponse } from "next/server";

// ROUTE DEBUG TAM THOI - do CHINH XAC gioi han timeout THAT cua tai
// khoan nay (khong phu thuoc code phuc tap nao khac, chi cho ngu don
// gian N giay) - de xac dinh dung con so, khong doan mo dua tren tai
// lieu Vercel mau thuan nua.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const seconds = Number(searchParams.get("s") ?? "5");
  const start = Date.now();
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  return NextResponse.json({ requestedSeconds: seconds, actualElapsedMs: Date.now() - start });
}
