import { createServiceClient } from "@/lib/supabase/client";

export const maxDuration = 60;

// LUU Y: Day la SSE (Server-Sent Events), KHONG phai WebSocket that.
// FIX (Muc 3, 2026-08-27): truoc day poll Supabase MOI 5 GIAY vo dieu kien,
// du lieu chi doi 2 lan/ngay (cron) - lang phi ~99% so lan query. Gio dung
// Supabase Realtime (Postgres logical replication) - CHI truy van lai khi
// co INSERT that vao world_macro_trends/world_market_pulse. Van gui 1 lan
// ngay khi client ket noi (client can du lieu hien tai, khong chi cho
// thay doi tiep theo). Van dong sau 55s - EventSource client TU DONG
// RECONNECT (hanh vi mac dinh).
//
// YEU CAU HA TANG (khong phai code): phai bat "Realtime" cho 2 bang nay
// trong Supabase Dashboard -> Database -> Replication, neu chua bat se
// khong nhan duoc event nao (khong loi, chi im lang khong co update moi).

export async function GET() {
  const supabase = createServiceClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const sendUpdate = async () => {
        if (closed) return;
        const { data: latestMacro } = await supabase
          .from("world_macro_trends").select("*").order("fetched_at", { ascending: false }).limit(1).single();
        const { data: latestMarkets } = await supabase
          .from("world_market_pulse").select("*").order("fetched_at", { ascending: false }).limit(10);

        const payload = JSON.stringify({ macro: latestMacro, markets: latestMarkets, timestamp: new Date().toISOString() });
        try {
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch {
          // Controller co the da dong (client ngat ket noi giua chung) - bo qua
        }
      };

      // Gui snapshot dau tien ngay khi client ket noi
      await sendUpdate();

      // Dang ky lang nghe INSERT that qua Postgres Realtime, thay vi poll
      const channel = supabase
        .channel("global-stream-updates")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "world_macro_trends" }, () => sendUpdate())
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "world_market_pulse" }, () => sendUpdate())
        .subscribe();

      // Heartbeat nhe (khong query DB) de giu ket noi song, tranh proxy/
      // trinh duyet tu dong dong do khong co du lieu qua lau (khac han
      // setInterval(sendUpdate, 5000) cu - heartbeat nay KHONG truy van DB).
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          // Bo qua neu controller da dong
        }
      }, 15000);

      setTimeout(() => {
        closed = true;
        clearInterval(heartbeat);
        supabase.removeChannel(channel);
        try {
          controller.close();
        } catch {
          // Da dong roi thi bo qua
        }
      }, 55000);
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
