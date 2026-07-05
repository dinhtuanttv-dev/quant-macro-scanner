// components/catalyst/CatalystTab.tsx
// Tab "Chất xúc tác" hoàn chỉnh — ghép header (quét lúc nào, panel ngưỡng cảnh báo),
// toggle giữa view "Theo ngành" (SectorRadarView) và "Top mã trực tiếp" (TopMoversBoard).
//
// Component này chỉ NHẬN dữ liệu đã tính sẵn từ CatalystEngine qua props — mọi tính toán
// (lan truyền, price-in, khối lượng, dòng tiền ngoại, xếp hạng...) đều xảy ra ở server/engine.

import { useState } from "react";
import { SectorRadarView } from "./SectorRadarView";
import { TopMoversBoard } from "./TopMoversBoard";
import type { SectorRanking, TopMoverEntry, EmergingSourceCard } from "@/lib/catalyst/CatalystEngine";
import type { AlertConfig, TriggeredAlert } from "@/lib/catalyst/types";

const TOKENS = {
  bg: "#0A0E14", surface: "#12171F", border: "#1F2731",
  text: "#E8ECF1", muted: "#7C8798", green: "#16C784", purple: "#B980F0",
};

export interface CatalystTabProps {
  lastScanLabel: string;      // vd "5 phút trước · 42 nguồn"
  sectors: SectorRanking[];
  emerging: EmergingSourceCard[];
  upMovers: TopMoverEntry[];
  downMovers: TopMoverEntry[];
  totalBenefitCount: number;
  totalHarmCount: number;
  alertConfig: AlertConfig;
  onAlertConfigChange: (config: AlertConfig) => void;
  activeAlerts: TriggeredAlert[];
}

export function CatalystTab({
  lastScanLabel,
  sectors,
  emerging,
  upMovers,
  downMovers,
  totalBenefitCount,
  totalHarmCount,
  alertConfig,
  onAlertConfigChange,
  activeAlerts,
}: CatalystTabProps) {
  const [view, setView] = useState<"sector" | "board">("sector");
  const [alertPanelOpen, setAlertPanelOpen] = useState(false);

  return (
    <div style={{ background: TOKENS.bg, color: TOKENS.text, fontFamily: "Inter, sans-serif" }} className="p-7">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-[18px] font-bold">
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: TOKENS.green }} className="animate-pulse" />
          Radar Chất xúc tác
        </div>
        <div className="flex items-center gap-3.5">
          <span style={{ color: TOKENS.muted, fontFamily: "IBM Plex Mono, monospace" }} className="text-[11px]">
            Quét lần cuối: {lastScanLabel}
          </span>
          <button
            onClick={() => setAlertPanelOpen(!alertPanelOpen)}
            style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, color: TOKENS.muted }}
            className="rounded-lg px-2.5 py-1.5 text-[12px]"
          >
            ⚙ Ngưỡng cảnh báo {activeAlerts.length > 0 ? `(${activeAlerts.length})` : ""}
          </button>
        </div>
      </div>

      {/* Alert panel */}
      {alertPanelOpen && (
        <div style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}` }} className="rounded-lg p-4 mb-4">
          <AlertRow
            label="Báo khi 1 ngành vượt net score"
            value={alertConfig.minSectorNetScore}
            onChange={(v) => onAlertConfigChange({ ...alertConfig, minSectorNetScore: v })}
          />
          <AlertRow
            label='Báo khi catalyst "sắp thực thi" còn dưới (ngày)'
            value={alertConfig.maxDaysBeforeExecutionForAlert}
            onChange={(v) => onAlertConfigChange({ ...alertConfig, maxDaysBeforeExecutionForAlert: v })}
          />
          <AlertRow
            label="Chỉ báo khi tối thiểu số nguồn xác nhận"
            value={alertConfig.minCorroborationCount}
            onChange={(v) => onAlertConfigChange({ ...alertConfig, minCorroborationCount: v })}
          />
          {activeAlerts.length > 0 && (
            <div style={{ borderTop: `1px solid ${TOKENS.border}` }} className="mt-2.5 pt-2.5 flex flex-col gap-1.5">
              {activeAlerts.map((a, i) => (
                <p key={i} style={{ fontSize: 12, color: TOKENS.text }}>• {a.message}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* View toggle */}
      <div style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}` }} className="flex gap-1 rounded-lg p-1 w-fit mb-4.5">
        <ViewTab label="Theo ngành" active={view === "sector"} onClick={() => setView("sector")} />
        <ViewTab label="Top mã trực tiếp" active={view === "board"} onClick={() => setView("board")} />
      </div>

      {view === "sector" ? (
        <SectorRadarView sectors={sectors} emerging={emerging} />
      ) : (
        <TopMoversBoard
          upMovers={upMovers}
          downMovers={downMovers}
          totalBenefitCount={totalBenefitCount}
          totalHarmCount={totalHarmCount}
        />
      )}
    </div>
  );
}

function ViewTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: active ? "#1A2130" : "transparent",
        color: active ? TOKENS.purple : TOKENS.muted,
        fontWeight: active ? 500 : 400,
      }}
      className="rounded-md px-3.5 py-1.5 text-[12.5px] cursor-pointer"
    >
      {label}
    </div>
  );
}

function AlertRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-[12.5px]">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ background: "#171D27", border: "1px solid #1F2731", color: "#E8ECF1", fontFamily: "IBM Plex Mono, monospace" }}
        className="rounded px-2 py-1 w-[70px] text-[12px]"
      />
    </div>
  );
}