import { NextResponse } from "next/server";
import { getDomesticEventsWithCountdown } from "@/lib/domestic-events/domestic-events-data";

// Doc lich su kien co cau thi truong trong nuoc THAT - khong can xac thuc
// CRON_SECRET vi day la du lieu tinh, khong ton phi/tai nguyen khi goi.
export async function GET() {
  try {
    const events = getDomesticEventsWithCountdown();
    return NextResponse.json({ events });
  } catch (err) {
    console.error("[api/catalysts/domestic-events] Loi:", err);
    return NextResponse.json({ error: "Khong doc duoc su kien trong nuoc." }, { status: 500 });
  }
}
