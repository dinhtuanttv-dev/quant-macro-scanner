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
//
// MO RONG (2026-09-10): gop them Cao su/Phan bon tu bang moi
// monthly_commodity_price (tan suat thang, KHAC voi world_macro_trends
// theo phut). Khong dang ky Realtime rieng cho bang nay - du lieu thang
// khong can real-time, chi can co trong payload moi lan client ket noi
// hoac moi lan world_macro_trends co INSERT moi (~1 lan/5 phut theo cron
// hien co) la du.

interface MonthlyCommodityRow {
  commodity_key: string;
  period: string;
  price: number;
  fetched_at: string;
}

function buildMonthlyCommodityFields(rows: MonthlyCommodityRow[] | null, commodityKey: string) {
  const filtered = (rows ?? [])
    .filter((r) => r.commodity_key === commodityKey)
    .sort((a, b) => a.period.localeCompare(b.period)); // cu -> moi

  if (filtered.length === 0) {
    return { price: null, changePercent: null, updatedAt: null, history: null };
  }

  const latest = filtered[filtered.length - 1];
  const previous = filtered.length >= 2 ? filtered[filtered.length - 2] : null;
  const changePercent = previous && previous.price !== 0
    ? ((latest.price - previous.price) / previous.price) * 100
    : null;

  return {
    price: latest.price,
    changePercent: changePercent !== null ? Math.round(changePercent * 100) / 100 : null,
    updatedAt: latest.fetched_at,
    history: filtered.map((r) => r.price),
  };
}

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

        // MOI (2026-09-10): lay 6 ky gan nhat cho ca RUBBER_RSS3 va UREA -
        // bang nho (toi da vai chuc dong), khong can gioi han qua chat.
        const { data: monthlyCommodities } = await supabase
          .from("monthly_commodity_price")
          .select("commodity_key, period, price, fetched_at")
          .in("commodity_key", ["RUBBER_RSS3", "UREA"])
          .order("period", { ascending: false })
          .limit(20);

        const rubber = buildMonthlyCommodityFields(monthlyCommodities, "RUBBER_RSS3");
        const urea = buildMonthlyCommodityFields(monthlyCommodities, "UREA");

        // Gop truc tiep vao object macro (giu nguyen cac truong cu, chi
        // THEM truong moi) - frontend da co san optional field cho cac
        // truong nay, khong pha vo hop dong cu.
        const macroWithCommodities = latestMacro
          ? {
              ...latestMacro,
              rubber_price: rubber.price,
              rubber_change_percent: rubber.changePercent,
              rubber_price_updated_at: rubber.updatedAt,
              rubber_price_history: rubber.history,
              fertilizer_urea_price: urea.price,
              fertilizer_urea_change_percent: urea.changePercent,
              fertilizer_urea_price_updated_at: urea.updatedAt,
              fertilizer_urea_price_history: urea.history,
            }
          : latestMacro;

        const payload = JSON.stringify({ macro: macroWithCommodities, markets: latestMarkets, timestamp: new Date().toISOString() });
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
