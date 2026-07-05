// components/catalyst/SectorRadarView.tsx
import { useState } from "react";
import { ShieldCheck, AlertTriangle, TrendingUp, TrendingDown, Star } from "lucide-react";
import type { SectorRanking, TickerImpactCard, EmergingSourceCard } from "@/lib/catalyst/CatalystEngine";

const TOKENS = {
  bg: "#0A0E14", surface: "#12171F", surface2: "#171D27", border: "#1F2731",
  text: "#E8ECF1", muted: "#7C8798",
  green: "#16C784", red: "#F6465D", purple: "#B980F0", cyan: "#4FC3F7", amber: "#F0B90B",
};

const PROP_LABEL: Record<string, string> = {
  direct: "Trực tiếp", upstream: "Thượng nguồn", downstream: "Hạ nguồn",
  competitor: "Đối thủ", commodity: "Cùng hàng hoá",
};
const PROP_COLOR: Record<string, string> = {
  direct: TOKENS.green, upstream: TOKENS.cyan, downstream: TOKENS.cyan,
  competitor: TOKENS.purple, commodity: TOKENS.muted,
};
const HORIZON_LABEL: Record<string, string> = { short: "Ngắn hạn", medium: "Trung hạn", long: "Dài hạn" };

function TickerCard({ card, isCascade }: { card: TickerImpactCard; isCascade?: boolean }) {
  if (isCascade) {
    return (
      <div style={{ borderLeft: `2px dashed ${TOKENS.cyan}55`, paddingLeft: 8, opacity: 0.9 }} className="py-2.5">
        <div className="flex items-center gap-2 mb-1">
          <span style={{ fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, fontSize: 13 }}>{card.ticker}</span>
        </div>
        <p style={{ fontSize: 12, color: TOKENS.text, lineHeight: 1.4 }}>{card.sourceTitle}</p>
        <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 10.5, color: TOKENS.amber }}>
          Điểm CH: {card.opportunityScore > 0 ? "+" : ""}{card.opportunityScore.toFixed(1)}
        </span>
      </div>
    );
  }

  return (
    <div style={{ borderTop: `1px solid ${TOKENS.border}` }} className="pt-2.5 pb-2.5 first:border-t-0">
      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
        <span style={{ fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, fontSize: 13 }}>{card.ticker}</span>
        {card.isBestPickInGroup && (
          <span style={{ background: "rgba(240,185,11,0.15)", color: TOKENS.amber }} className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1">
            <Star size={9} /> Lựa chọn tốt nhất nhóm
          </span>
        )}
        <span style={{ border: `1px solid ${PROP_COLOR[card.propagationDistance]}55`, color: PROP_COLOR[card.propagationDistance] }} className="text-[9.5px] px-1.5 py-0.5 rounded">
          {PROP_LABEL[card.propagationDistance]}
        </span>
        <span style={{ border: `1px solid ${TOKENS.border}`, color: TOKENS.muted }} className="text-[9.5px] px-1.5 py-0.5 rounded">
          {HORIZON_LABEL[card.horizon]}
        </span>
        {card.isConflicted && (
          <span style={{ background: "rgba(240,185,11,0.14)", color: TOKENS.amber }} className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded">
            ⇄ Xung đột
          </span>
        )}
        {card.priceInStatus === "not_reflected" ? (
          <span style={{ background: "rgba(22,199,132,0.15)", color: TOKENS.green }} className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded">
            ◆ Chưa phản ánh
          </span>
        ) : (
          <span style={{ background: "rgba(124,135,152,0.15)", color: TOKENS.muted }} className="text-[9.5px] px-1.5 py-0.5 rounded">
            Đã phản ánh phần lớn
          </span>
        )}
        {card.volumeFlag === "confirmed" && (
          <span style={{ background: "rgba(22,199,132,0.1)", color: TOKENS.green }} className="text-[9.5px] px-1.5 py-0.5 rounded flex items-center gap-1">
            <ShieldCheck size={9} /> KL xác nhận
          </span>
        )}
        {card.volumeFlag === "suspicious" && (
          <span style={{ background: "rgba(246,70,93,0.12)", color: TOKENS.red }} className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1">
            <AlertTriangle size={9} /> KL bất thường trước tin
          </span>
        )}
      </div>

      <p style={{ fontSize: 12, color: TOKENS.text, lineHeight: 1.4 }} className="mb-1.5">
        {card.sourceTitle} <span style={{ color: TOKENS.muted }}>· ×{card.corroborationCount} nguồn</span>
      </p>

      <div className="flex items-center gap-2.5 flex-wrap text-[10.5px]" style={{ fontFamily: "IBM Plex Mono, monospace" }}>
        <span className="flex items-center gap-1.5">
          <span style={{ width: 42, height: 5, background: TOKENS.surface2, borderRadius: 3, overflow: "hidden", display: "inline-block" }}>
            <span style={{ display: "block", height: "100%", width: `${card.historicalWinRate}%`, background: TOKENS.cyan }} />
          </span>
          <span style={{ color: TOKENS.cyan }}>Thắng lịch sử: {card.historicalWinRate}%</span>
        </span>

        {card.foreignFlowDirection !== "none" && (
          <span style={{ color: card.foreignFlowDirection === "buy" ? TOKENS.green : TOKENS.red }} className="flex items-center gap-1">
            {card.foreignFlowDirection === "buy" ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            Khối ngoại {card.foreignFlowDirection === "buy" ? "mua" : "bán"} {card.foreignFlowValue}
          </span>
        )}

        <span style={{ color: TOKENS.amber }}>Điểm CH: {card.opportunityScore > 0 ? "+" : ""}{card.opportunityScore.toFixed(1)}</span>

        <span style={{ color: card.scheduled ? TOKENS.purple : TOKENS.muted, marginLeft: "auto" }}>
          {card.scheduled ? `⏱ còn ${Math.round(card.daysRemaining ?? 0)} ngày` : "đang diễn ra"}
        </span>
      </div>
    </div>
  );
}

function SectorRow({ sector, defaultOpen }: { sector: SectorRanking; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const maxAbs = 10;
  const pct = Math.min(Math.abs(sector.netScore) / maxAbs, 1) * 50;
  const isPositive = sector.netScore >= 0;

  return (
    <div style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}` }} className="rounded-lg mb-2 overflow-hidden">
      <div onClick={() => setOpen(!open)} className="flex items-center gap-3 px-3.5 py-3 cursor-pointer hover:bg-[#171D27]">
        <span style={{ color: TOKENS.muted, width: 14, fontSize: 11 }}>{open ? "▾" : "▸"}</span>
        <span style={{ width: 150, fontSize: 13.5, fontWeight: 500 }} className="flex items-center gap-1.5">
          {sector.sector}
          {sector.isNew && (
            <span style={{ background: "rgba(185,128,240,0.15)", color: TOKENS.purple }} className="text-[9px] px-1.5 py-0.5 rounded-full">MỚI</span>
          )}
        </span>
        <div style={{ background: TOKENS.surface2 }} className="flex-1 h-5 rounded relative overflow-hidden">
          <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: TOKENS.border }} />
          <div
            style={{
              position: "absolute", top: 0, bottom: 0, borderRadius: 4,
              ...(isPositive
                ? { left: "50%", width: `${pct}%`, background: `linear-gradient(90deg, ${TOKENS.green}88, ${TOKENS.green})` }
                : { right: "50%", width: `${pct}%`, background: `linear-gradient(270deg, ${TOKENS.red}88, ${TOKENS.red})` }),
            }}
          />
        </div>
        <span style={{ width: 56, textAlign: "right", fontSize: 13, fontWeight: 600, color: isPositive ? TOKENS.green : TOKENS.red, fontFamily: "IBM Plex Mono, monospace" }}>
          {sector.netScore > 0 ? "+" : ""}{sector.netScore.toFixed(1)}
        </span>
        <span style={{ width: 90, textAlign: "right", fontSize: 12, color: TOKENS.amber, fontFamily: "IBM Plex Mono, monospace" }}>
          CH: {sector.opportunityScore > 0 ? "+" : ""}{sector.opportunityScore.toFixed(1)}
        </span>
        <span style={{ width: 66, textAlign: "right", fontSize: 11, color: TOKENS.muted, fontFamily: "IBM Plex Mono, monospace" }}>
          {sector.tickerCount} mã
        </span>
      </div>

      {open && (
        <div style={{ paddingLeft: 164 }} className="px-3.5 pb-3.5">
          {sector.primaryCards.map((c) => <TickerCard key={c.ticker} card={c} />)}
          {sector.cascadeCards.length > 0 && (
            <>
              <div style={{ borderTop: `1px dashed ${TOKENS.border}`, color: TOKENS.cyan }} className="text-[10px] uppercase tracking-wide mt-2.5 pt-2 mb-1">
                Tác động bậc 2 — cơ hội sớm
              </div>
              {sector.cascadeCards.map((c) => <TickerCard key={c.ticker} card={c} isCascade />)}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function SectorRadarView({
  sectors,
  emerging,
}: {
  sectors: SectorRanking[];
  emerging: EmergingSourceCard[];
}) {
  return (
    <div style={{ color: TOKENS.text, fontFamily: "Inter, sans-serif" }}>
      {emerging.length > 0 && (
        <>
          <div style={{ color: TOKENS.muted }} className="text-[11px] uppercase tracking-wide mb-2">
            Vừa phát hiện (trong 2 giờ qua)
          </div>
          <div style={{ borderBottom: `1px solid ${TOKENS.border}` }} className="flex gap-2.5 overflow-x-auto pb-3.5 mb-4">
            {emerging.map((e) => (
              <div key={e.sourceId} style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.purple}55`, minWidth: 230 }} className="rounded-lg p-2.5 shrink-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="flex items-center gap-1.5">
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: TOKENS.purple }} />
                    <span style={{ color: TOKENS.purple, fontSize: 10 }} className="uppercase tracking-wide">{e.category}</span>
                  </span>
                  <span style={{ background: TOKENS.surface2, color: TOKENS.muted }} className="text-[9.5px] px-1.5 py-0.5 rounded-full">
                    ×{e.corroborationCount} nguồn
                  </span>
                </div>
                <p style={{ fontSize: 12, lineHeight: 1.35 }}>{e.title}</p>
                <p style={{ fontSize: 10.5, color: TOKENS.muted, marginTop: 5 }}>→ {e.affectedTargetCount} đối tượng bị ảnh hưởng</p>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ color: TOKENS.muted }} className="text-[11px] uppercase tracking-wide mb-2.5">
        Xếp hạng ngành theo tác động ròng (cột "CH" = điểm cơ hội đã điều chỉnh thanh khoản)
      </div>
      {sectors.map((s, i) => (
        <SectorRow key={s.sector} sector={s} defaultOpen={i === 0} />
      ))}
    </div>
  );
}