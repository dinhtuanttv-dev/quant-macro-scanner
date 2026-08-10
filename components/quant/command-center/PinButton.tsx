// components/quant/command-center/PinButton.tsx
// Atom: Nut ghim su kien + popover chon su kien.
// State isOpen cuc bo TRONG chinh PinButton - khong day len Tang1TableRow,
// tranh re-render ca dong khi mo/dong popover.

"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { colors, radius, spacing, fontSize, scenarioColors } from "@/lib/design-tokens";
import type { MacroEventSummary } from "@/lib/types/siu-quet-ai";

interface Props {
  ticker: string;
  pinnedEventId: string | null;
  availableEvents: MacroEventSummary[];
  onPin: (ticker: string, eventId: string) => void;
  onUnpin: (ticker: string) => void;
}

export const PinButton = React.memo(function PinButton({
  ticker, pinnedEventId, availableEvents, onPin, onUnpin,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Dong popover khi click ra ngoai
  useEffect(() => {
    if (!isOpen) return;
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [isOpen]);

  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen((v) => !v);
  }, []);

  const handlePin = useCallback((eventId: string) => {
    onPin(ticker, eventId);
    setIsOpen(false);
  }, [ticker, onPin]);

  const handleUnpin = useCallback(() => {
    onUnpin(ticker);
    setIsOpen(false);
  }, [ticker, onUnpin]);

  const pinnedEvent = pinnedEventId
    ? availableEvents.find((e) => e.sourceId === pinnedEventId)
    : null;

  const isPinned = !!pinnedEvent;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      {/* Nut ghim chinh */}
      <button
        onClick={toggle}
        title={isPinned ? `Da ghim: ${pinnedEvent?.title}` : "Ghim su kien vao ma nay"}
        style={{
          background: isPinned ? "rgba(167,139,250,0.15)" : "rgba(148,163,184,0.08)",
          border: `1px solid ${isPinned ? colors.violet : colors.border}`,
          color: isPinned ? colors.violet : colors.muted,
          borderRadius: radius.sm,
          width: 26, height: 26,
          cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, transition: "all 0.15s",
        }}
      >
        📌
      </button>

      {/* Badge ten su kien da ghim */}
      {pinnedEvent && (
        <div
          style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            background: "rgba(167,139,250,0.12)",
            border: `1px solid rgba(167,139,250,0.3)`,
            color: colors.violet,
            fontSize: fontSize.xs, padding: "2px 6px",
            borderRadius: 999, marginLeft: spacing.xs,
            maxWidth: 120, overflow: "hidden",
            whiteSpace: "nowrap", textOverflow: "ellipsis",
          }}
        >
          {pinnedEvent.title.slice(0, 16)}…
          <button
            onClick={(e) => { e.stopPropagation(); handleUnpin(); }}
            style={{ background: "none", border: "none", color: colors.violet,
              cursor: "pointer", fontSize: 11, padding: 0, marginLeft: 2 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Popover chon su kien */}
      {isOpen && (
        <div
          style={{
            position: "absolute", right: 0, top: 30,
            background: "#0a1020",
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md, padding: spacing.xs,
            width: 220, zIndex: 50,
            boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
          }}
        >
          <div style={{ fontSize: fontSize.xs, color: colors.muted,
            padding: `${spacing.xs} ${spacing.sm}`, marginBottom: 2 }}>
            Chon su kien de ghim vao {ticker}:
          </div>
          {availableEvents.map((ev) => (
            <div
              key={ev.sourceId}
              onClick={() => handlePin(ev.sourceId)}
              style={{
                padding: `${spacing.sm} ${spacing.sm}`,
                borderRadius: radius.sm, fontSize: fontSize.sm,
                cursor: "pointer", display: "flex",
                justifyContent: "space-between", alignItems: "center",
                background: pinnedEventId === ev.sourceId
                  ? "rgba(167,139,250,0.1)" : "transparent",
                color: pinnedEventId === ev.sourceId ? colors.violet : colors.text,
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap", flex: 1 }}>
                {ev.title}
              </span>
              <span style={{ fontSize: fontSize.xs, color: colors.muted,
                flexShrink: 0, marginLeft: spacing.xs }}>
                {Math.ceil(ev.daysRemaining)}d
              </span>
            </div>
          ))}
          {isPinned && (
            <div
              onClick={handleUnpin}
              style={{
                padding: `${spacing.sm} ${spacing.sm}`,
                borderRadius: radius.sm, fontSize: fontSize.sm,
                cursor: "pointer", color: colors.red,
                borderTop: `1px solid ${colors.border}`, marginTop: 4,
              }}
            >
              ✕ Bo ghim
            </div>
          )}
        </div>
      )}
    </div>
  );
});
