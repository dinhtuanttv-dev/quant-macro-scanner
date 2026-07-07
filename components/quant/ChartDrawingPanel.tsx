"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { MousePointerClick, Trash2, Info } from "lucide-react";
import { TaController, type DraftZonePixels } from "@/lib/ta-drawing/TaController";
import type { OhlcvBar } from "@/lib/ta-drawing/ChartManager";
import type { PriceZone } from "@/lib/ta-drawing/DrawingManager";
import type { ZoneAnalysisResult } from "@/lib/ta-drawing/AIEngine";

const CHART_HEIGHT = 320;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 20;

interface Props { bars: OhlcvBar[]; ticker: string; }

export default function ChartDrawingPanel({ bars, ticker }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<TaController | null>(null);
  const [containerWidth, setContainerWidth] = useState(600);
  const [zones, setZones] = useState<PriceZone[]>([]);
  const [log, setLog] = useState<ZoneAnalysisResult[]>([]);
  const [draft, setDraft] = useState<DraftZonePixels | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerWidth(w);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (bars.length === 0) return;
    const dims = { width: containerWidth, height: CHART_HEIGHT, paddingTop: PADDING_TOP, paddingBottom: PADDING_BOTTOM };
    if (!controllerRef.current) controllerRef.current = new TaController(bars, dims);
    else controllerRef.current.updateData(bars, dims);

    const controller = controllerRef.current;
    const unsubLog = controller.onLogUpdated(setLog);
    const unsubZones = controller.onZonesUpdated(setZones);
    const unsubDraft = controller.onDraftUpdated(setDraft);
    setZones(controller.getZonesForRender().map((z) => z.zone));
    setLog(controller.getLog());
    return () => { unsubLog(); unsubZones(); unsubDraft(); };
  }, [bars, containerWidth]);

  useEffect(() => () => { controllerRef.current?.destroy(); controllerRef.current = null; }, []);

  const getRelCoords = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);
  const onDown = (e: React.MouseEvent<SVGSVGElement>) => { const { x, y } = getRelCoords(e); controllerRef.current?.handlePixelDown(x, y); };
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => { const { x, y } = getRelCoords(e); controllerRef.current?.handlePixelMove(x, y); };
  const onUp = (e: React.MouseEvent<SVGSVGElement>) => { const { x, y } = getRelCoords(e); controllerRef.current?.handlePixelUp(x, y); };

  const zonesForRender = controllerRef.current?.getZonesForRender() ?? [];
  if (bars.length === 0) return <div className="text-xs text-slate-500 italic py-8 text-center">Chưa có dữ liệu nến để vẽ vùng.</div>;

  const maxPrice = Math.max(...bars.map((b) => b.high));
  const minPrice = Math.min(...bars.map((b) => b.low));
  const priceRange = maxPrice - minPrice || 1;
  const toY = (price: number) => PADDING_TOP + (1 - (price - minPrice) / priceRange) * (CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM);
  const barWidth = containerWidth / bars.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-slate-500 flex items-center gap-1.5">
          <MousePointerClick className="w-3 h-3" />
          Kéo chuột trên biểu đồ để vẽ vùng Hỗ trợ/Kháng cự — AI Engine tự động phân tích.
        </p>
        {zones.length > 0 && (
          <button onClick={() => controllerRef.current?.clearAllZones()} className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1">
            <Trash2 className="w-3 h-3" /> Xóa tất cả ({zones.length})
          </button>
        )}
      </div>

      <div ref={containerRef} style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-xl overflow-hidden relative">
        <svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${containerWidth} ${CHART_HEIGHT}`} className="cursor-crosshair select-none"
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={() => controllerRef.current?.cancelDrawing()}>
          {bars.map((bar, i) => {
            const isGreen = bar.close >= bar.open;
            const x = i * barWidth + barWidth / 2;
            const bodyTopY = toY(Math.max(bar.open, bar.close));
            const bodyBottomY = toY(Math.min(bar.open, bar.close));
            return (
              <g key={i}>
                <line x1={x} y1={toY(bar.high)} x2={x} y2={toY(bar.low)} stroke="#475569" strokeWidth="1" />
                <rect x={x - barWidth * 0.35} y={bodyTopY} width={barWidth * 0.7} height={Math.max(1, bodyBottomY - bodyTopY)} fill={isGreen ? "#10b981" : "#ef4444"} opacity="0.85" />
              </g>
            );
          })}
          {zonesForRender.map(({ zone, pixelTop, pixelBottom, pixelLeft, pixelRight }) => (
            <g key={zone.id}>
              <rect x={Math.min(pixelLeft, pixelRight)} y={pixelTop} width={Math.abs(pixelRight - pixelLeft)} height={Math.max(2, pixelBottom - pixelTop)} fill="rgba(245,158,11,0.12)" stroke="rgba(245,158,11,0.5)" strokeWidth="1" strokeDasharray="4,2" />
              <text x={Math.min(pixelLeft, pixelRight) + 4} y={pixelTop - 4} fill="#fbbf24" fontSize="9" fontWeight="700">{zone.topPrice.toLocaleString()}</text>
            </g>
          ))}
          {draft && (
            <rect x={Math.min(draft.x1, draft.x2)} y={Math.min(draft.y1, draft.y2)} width={Math.abs(draft.x2 - draft.x1)} height={Math.abs(draft.y2 - draft.y1)} fill="rgba(56,189,248,0.15)" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="3,2" />
          )}
        </svg>
      </div>

      <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-xl p-3">
        <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1"><Info className="w-3 h-3" /> Log Phân Tích AI Engine ({log.length})</p>
        {log.length === 0 ? (
          <p className="text-[10px] text-slate-600 italic py-2">Chưa có vùng nào được vẽ cho {ticker}.</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {log.map((entry, i) => (
              <div key={i} style={{ background: "rgba(14,22,38,0.7)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-lg p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[10px] font-bold ${entry.classification === "Hỗ trợ" ? "text-emerald-400" : entry.classification === "Kháng cự" ? "text-red-400" : "text-slate-400"}`}>{entry.classification}</span>
                  <span className="text-[9px] font-mono text-amber-400">Conf: {entry.confidenceScore}/100</span>
                </div>
                <p className="text-[10px] text-slate-300 leading-relaxed">{entry.summary}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}