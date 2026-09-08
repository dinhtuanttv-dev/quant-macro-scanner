import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildStaticMacroCalendar } from "@/lib/catalyst/calendar/staticMacroCalendar";

// Dong bo lich vi mo TINH (CPI/PMI/FOMC - chu ky cong khai da biet truoc) vao
// Prisma CatalystSource voi executionDate da dien san. Khong tao ImpactEdge
// (khong gan cho ticker/nganh cu the) - CatalystEngine.getUpcomingMacroEvents()
// da doc san executionDate, tu dong hoat dong ma khong can sua Engine.
// Upsert theo originRecordId = id su kien -> chay lai nhieu lan khong tao trung.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const events = buildStaticMacroCalendar();
    let created = 0;
    let updated = 0;

    for (const ev of events) {
      const existing = await prisma.catalystSource.findUnique({ where: { originRecordId: ev.id } });
      await prisma.catalystSource.upsert({
        where: { originRecordId: ev.id },
        update: { executionDate: ev.executionDate },
        create: {
          title: ev.title,
          category: ev.category,
          sourceCredibility: "confirmed",
          publishedDate: new Date(),
          firstDetectedAt: new Date(),
          corroborationCount: 1,
          originRecordId: ev.id,
          executionDate: ev.executionDate,
        },
      });
      if (existing) updated++; else created++;
    }

    return NextResponse.json({ ok: true, totalEvents: events.length, created, updated });
  } catch (err) {
    console.error("[api/catalysts/macro-calendar-sync] Loi:", err);
    return NextResponse.json({ error: "Khong dong bo duoc lich vi mo." }, { status: 500 });
  }
}
