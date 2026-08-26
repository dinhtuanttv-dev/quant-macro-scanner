import { createServiceClient } from "@/lib/supabase/client";

export const maxDuration = 60;

// LUU Y: Day la SSE (Server-Sent Events), KHONG phai WebSocket that.
// Poll Supabase moi 5s va push qua stream. Dong sau 55s - EventSource
// phia client TU DONG RECONNECT (hanh vi mac dinh cua EventSource API).

export async function GET() {
  const supabase = createServiceClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendUpdate = async () => {
        const { data: latestMacro } = await supabase
          .from("macro_trends").select("*").order("fetched_at", { ascending: false }).limit(1).single();
        const { data: latestMarkets } = await supabase
          .from("market_pulse").select("*").order("fetched_at", { ascending: false }).limit(10);

        const payload = JSON.stringify({ macro: latestMacro, markets: latestMarkets, timestamp: new Date().toISOString() });
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      };

      await sendUpdate();
      const interval = setInterval(sendUpdate, 5000);
      setTimeout(() => { clearInterval(interval); controller.close(); }, 55000);
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
