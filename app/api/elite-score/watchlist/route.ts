import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 10;

/**
 * MOCK ROUTE: danh sách mã cho tab "Elite 10".
 * Tạm thời trả 12 mã VN-Index phổ biến, mock changePct để dev/test.
 *
 * TODO (Backend): thay bằng dữ liệu thật từ watchlist (Core/Ring/Pinned).
 */

const MOCK_TICKERS = [
  { ticker: "VNM", changePct: 1.2, status: "core" as const, badge: "Core" },
  { ticker: "FPT", changePct: 2.4, status: "core" as const, badge: "Core" },
  { ticker: "MWG", changePct: 0.8, status: "core" as const, badge: "Core" },
  { ticker: "VCB", changePct: 0.3, status: "core" as const, badge: "Core" },
  { ticker: "HPG", changePct: -1.1, status: "ring" as const, badge: "Ring" },
  { ticker: "VHM", changePct: 0.5, status: "ring" as const, badge: "Ring" },
  { ticker: "VIC", changePct: -0.4, status: "ring" as const, badge: "Ring" },
  { ticker: "MSN", changePct: 1.7, status: "ring" as const, badge: "Ring" },
  { ticker: "SSI", changePct: 2.1, status: "watch" as const, badge: "Watch" },
  { ticker: "VRE", changePct: -0.8, status: "watch" as const, badge: "Watch" },
  { ticker: "CTG", changePct: 0.9, status: "watch" as const, badge: "Watch" },
  { ticker: "BID", changePct: 0.2, status: "watch" as const, badge: "Watch" },
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filter = (searchParams.get("filter") ?? "all").toLowerCase();

  let result = MOCK_TICKERS;
  if (filter === "core") result = MOCK_TICKERS.filter((t) => t.status === "core");
  else if (filter === "ring") result = MOCK_TICKERS.filter((t) => t.status === "ring");
  else if (filter === "pinned") result = MOCK_TICKERS.slice(0, 5);

  return NextResponse.json(
    result.map((t) => ({
      ticker: t.ticker,
      changePct: { value: t.changePct, source: "HARD_DATA" },
      status: t.status,
      badge: t.badge,
    })),
  );
}
