// components/catalyst/TopMoversBoard.tsx
import { Star } from "lucide-react";
import type { TopMoverEntry } from "@/lib/catalyst/CatalystEngine";

const TOKENS = {
  surface: "#12171F", border: "#1F2731", text: "#E8ECF1", muted: "#7C8798",
  green: "#16C784", red: "#F6465D", purple: "#B980F0", cyan: "#4FC3F7", amber: "#F0B90B",
};

function scoreColor(score: number) {
  if (score >= 75) return TOKENS.green;
  if (score >= 50) return TOKENS.amber;
  return TOKENS.muted;
}

function RankChange({ rank, prevRank }: { rank: number; prevRank: number | null }) {
  if (prevRank === null) {
    return <span style={{ color: TOKENS.purple, fontWeight: 700 }} className="w-[26px] text-center text-[10.5px] font-mono">MỚI</span>;
  }
  const diff = prevRank - rank;
  if (diff > 0) return <span style={{ color: TOKENS.green }} className="w-[26px] text-center text-[10.5px] font-mono">▲{diff}</span>;
  if (diff < 0) return <span style={{ color: TOKENS.red }} className="w-[26px] text-center text-[10.5px] font-mono">▼{Math.abs(diff)}</span>;
  return <span style={{ color: TOKENS.muted }} className="w-[26px] text-center text-[10.5px] font-mono">—</span>;
}

function BoardRow({ entry }: { entry: TopMoverEntry }) {
  return (
    <div
      style={{
        borderBottom: `1px solid ${TOKENS.border}`,
        ...(entry.isWatchlisted
          ? { background: "rgba(79,195,247,0.05)", boxShadow: `inset 3px 0 0 ${TOKENS.cyan}` }
          : {}),
      }}
      className="flex items-center gap-2.5 px-4 py-2.5 last:border-b-0"
    >
      <span style={{ color: TOKENS.muted, fontFamily: "IBM Plex Mono, monospace" }} className="w-[18px] text-center text-[12px]">
        {entry.rank}
      </span>
      <RankChange rank={entry.rank} prevRank={entry.prevRank} />
      <span style={{ fontFamily: "IBM Plex Mono, monospace", fontWeight: 700 }} className="w-[48px] text-[13px]">
        {entry.ticker}
      </span>
      <span style={{ color: TOKENS.muted }} className="flex-1 text-[11.5px] leading-tight">
        {entry.label}
      </span>
      {entry.isWatchlisted && <Star size={11} color={TOKENS.cyan} />}
      <span style={{ color: scoreColor(entry.compositeScore), fontFamily: "IBM Plex Mono, monospace" }} className="w-[30px] text-right text-[12.5px] font-bold">
        {entry.compositeScore}
      </span>
    </div>
  );
}

export function TopMoversBoard({
  upMovers,
  downMovers,
  totalBenefitCount,
  totalHarmCount,
}: {
  upMovers: TopMoverEntry[];
  downMovers: TopMoverEntry[];
  totalBenefitCount: number;
  totalHarmCount: number;
}) {
  return (
    <div style={{ color: TOKENS.text, fontFamily: "Inter, sans-serif" }}>
      <div style={{ color: TOKENS.muted }} className="text-[11px] uppercase tracking-wide mb-2.5">
        Bảng xếp hạng tác động trực tiếp mạnh nhất
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}` }} className="rounded-xl overflow-hidden">
          <div style={{ borderBottom: `1px solid ${TOKENS.border}`, color: TOKENS.green }} className="flex items-center justify-between px-4 py-3 text-[12.5px] font-semibold">
            <span>▲ TOP TĂNG GIÁ</span>
            <span style={{ color: TOKENS.muted, fontWeight: 400 }} className="text-[10.5px]">
              {upMovers.length}/{totalBenefitCount} mã hưởng lợi
            </span>
          </div>
          {upMovers.map((e) => <BoardRow key={e.ticker} entry={e} />)}
        </div>

        <div style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}` }} className="rounded-xl overflow-hidden">
          <div style={{ borderBottom: `1px solid ${TOKENS.border}`, color: TOKENS.red }} className="flex items-center justify-between px-4 py-3 text-[12.5px] font-semibold">
            <span>▼ TOP GIẢM GIÁ</span>
            <span style={{ color: TOKENS.muted, fontWeight: 400 }} className="text-[10.5px]">
              {downMovers.length}/{totalHarmCount} mã bất lợi
            </span>
          </div>
          {downMovers.map((e) => <BoardRow key={e.ticker} entry={e} />)}
        </div>
      </div>

      <div style={{ color: TOKENS.muted }} className="flex gap-4 flex-wrap text-[11px] mt-3.5">
        <span><span style={{ background: TOKENS.purple }} className="inline-block w-2 h-2 rounded-full mr-1.5" />MỚI = mới lọt top so với lần quét trước</span>
        <span><span style={{ background: TOKENS.cyan }} className="inline-block w-2 h-2 rounded-full mr-1.5" />Viền trái xanh lam = mã trong watchlist của bạn</span>
        <span>▲2 / ▼1 = tăng/giảm bậc xếp hạng so với lần quét trước</span>
      </div>
    </div>
  );
}