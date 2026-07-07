"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Trash2 } from "lucide-react";
import { TVChartManager } from "@/lib/ta-command-center/TVChartManager";
import { AnalysisController } from "@/lib/ta-command-center/AnalysisController";
import DrawingPalette from "./DrawingPalette";
import LayerToggleBar from "./LayerToggleBar";
import AISignalLogPanel from "./AISignalLogPanel";
import { SMCPanel, VSAPanel, ElliottWavePanelPlaceholder, WyckoffPanelPlaceholder } from "./MethodPanels";
import type { OhlcvBar } from "@/lib/ta-drawing/ChartManager";
import type { DrawingToolType, DrawnPrimitive } from "@/lib/ta-command-center/DrawingManager";
import type { LayerState, LayerKey } from "@/lib/ta-command-center/LayerManager";
import type { SignalLogEntry } from "@/lib/ta-command-center/AIEngine";
import type { OrderBlock, FairValueGap, BreakOfStructure } from "@/lib/ta-command-center/detectors/smcDetector";
import type { VSASignal } from "@/lib/ta-command-center/detectors/vsaDetector";

interface Props { bars: OhlcvBar[]; ticker: string; }

export default function TVChartPanel({ bars, ticker }: Props) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const tvManagerRef = useRef<TVChartManager | null>(null);
  const controllerRef = useRef<AnalysisController | null>(null);
  const isDrawingRef = useRef(false);

  const [activeTool, setActiveTool] = useState<DrawingToolType | null>(null);
  const [primitives, setPrimitives] = useState<DrawnPrimitive[]>([]);
  const [layerState, setLayerState] = useState<LayerState | null>(null);
  const [log, setLog] = useState<SignalLogEntry[]>([]);
  const [smc, setSmc] = useState<{ obs: OrderBlock[]; fvgs: FairValueGap[]; bos: BreakOfStructure[] }>({ obs: [], fvgs: [], bos: [] });
  const [vsa, setVsa] = useState<VSASignal[]>([]);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!chartContainerRef.current || bars.length === 0) return;

    if (!tvManagerRef.current) tvManagerRef.current = new TVChartManager(chartContainerRef.current, bars);
    else tvManagerRef.current.setData(bars);

    if (!controllerRef.current) controllerRef.current = new AnalysisController(bars);
    else controllerRef.current.updateData(bars);

    const controller = controllerRef.current;
    const unsubPrim = controller.onPrimitivesUpdated(setPrimitives);
    const unsubLog = controller.onLogUpdated(setLog);
    const unsubSmc = controller.onSmcUpdated(setSmc);
    const unsubVsa = controller.onVsaUpdated(setVsa);
    const unsubLayers = controller.onLayersChanged(setLayerState);
    const unsubRange = tvManagerRef.current.onVisibleRangeChange(() => forceTick((t) => t + 1));

    setPrimitives(controller.drawing.getPrimitives());
    setLog(controller.getLog());
    setSmc(controller.getSmc());
    setVsa(controller.getVsa());
    setLayerState(controller.getLayerState());

    return () => { unsubPrim(); unsubLog(); unsubSmc(); unsubVsa(); unsubLayers(); unsubRange(); };
  }, [bars]);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && tvManagerRef.current) tvManagerRef.current.resize(w);
    });
    observer.observe(chartContainerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    tvManagerRef.current?.destroy(); tvManagerRef.current = null;
    controllerRef.current?.destroy(); controllerRef.current = null;
  }, []);

  const getSvgCoords = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const toDomainPoint = (x: number, y: number) => {
    const tv = tvManagerRef.current;
    if (!tv) return null;
    const price = tv.pixelToPrice(y);
    const date = tv.pixelToDate(x);
    if (price === null || date === null) return null;
    return { date, price };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!activeTool || !controllerRef.current) return;
    const { x, y } = getSvgCoords(e);
    const point = toDomainPoint(x, y);
    if (!point) return;
    isDrawingRef.current = true;
    controllerRef.current.drawing.startDraw(activeTool, point);
    forceTick((t) => t + 1);
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawingRef.current || !controllerRef.current) return;
    const { x, y } = getSvgCoords(e);
    const point = toDomainPoint(x, y);
    if (!point) return;
    controllerRef.current.drawing.updateDraw(point);
    forceTick((t) => t + 1);
  };
  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDrawingRef.current || !controllerRef.current) return;
    isDrawingRef.current = false;
    const { x, y } = getSvgCoords(e);
    const point = toDomainPoint(x, y);
    if (point) controllerRef.current.drawing.finishDraw(point);
    setActiveTool(null);
    forceTick((t) => t + 1);
  };

  const tv = tvManagerRef.current;
  const renderPrimitivePixels = (p: DrawnPrimitive) => {
    if (!tv) return null;
    const x1 = tv.timeToPixel(p.p1.date); const y1 = tv.priceToPixel(p.p1.price);
    const x2 = tv.timeToPixel(p.p2.date); const y2 = tv.priceToPixel(p.p2.price);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
    return { x1, y1, x2, y2 };
  };

  if (bars.length === 0) return <div className="text-xs text-slate-500 italic py-8 text-center">Chưa có dữ liệu nến cho {ticker}.</div>;

  return (
    <div className="space-y-3">
      {layerState && (
        <LayerToggleBar state={layerState}
          onToggle={(key: LayerKey) => controllerRef.current?.layers.toggle(key)}
          onToggleMaster={(on) => controllerRef.current?.layers.setMaster(on)} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 relative" style={{ minHeight: 360 }}>
          <DrawingPalette activeTool={activeTool} onSelectTool={setActiveTool} />
          {primitives.length > 0 && (
            <button onClick={() => controllerRef.current?.drawing.clearAll()}
              className="absolute top-3 right-3 z-10 text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1 bg-slate-900/80 px-2 py-1 rounded-lg">
              <Trash2 className="w-3 h-3" /> Xóa ({primitives.length})
            </button>
          )}
          <div ref={chartContainerRef} style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)", minHeight: 360 }} className="rounded-xl overflow-hidden relative" />
          <svg className="absolute inset-0 w-full h-full" style={{ cursor: activeTool ? "crosshair" : "default" }}
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
            onMouseLeave={() => { if (isDrawingRef.current) { controllerRef.current?.drawing.cancelDraw(); isDrawingRef.current = false; } }}>
            {primitives.map((p) => {
              const px = renderPrimitivePixels(p);
              if (!px) return null;
              if (p.toolType === "rectangle") {
                return <rect key={p.id} x={Math.min(px.x1, px.x2)} y={Math.min(px.y1, px.y2)} width={Math.abs(px.x2 - px.x1)} height={Math.abs(px.y2 - px.y1)} fill="rgba(245,158,11,0.12)" stroke="rgba(245,158,11,0.5)" strokeWidth={1} strokeDasharray="4,2" />;
              }
              if (p.toolType === "trendline") {
                return <line key={p.id} x1={px.x1} y1={px.y1} x2={px.x2} y2={px.y2} stroke="#38bdf8" strokeWidth={1.5} />;
              }
              return (
                <g key={p.id}>
                  {p.levels.map((lvl, i) => {
                    const y = tv?.priceToPixel(lvl.price);
                    if (y === null || y === undefined) return null;
                    return <line key={i} x1={Math.min(px.x1, px.x2)} y1={y} x2={Math.max(px.x1, px.x2)} y2={y} stroke="rgba(167,139,250,0.5)" strokeWidth={1} strokeDasharray="2,2" />;
                  })}
                </g>
              );
            })}
          </svg>
        </div>

        <div className="flex flex-col gap-2">
          <SMCPanel obs={smc.obs} fvgs={smc.fvgs} bos={smc.bos} />
          <VSAPanel signals={vsa} />
          <ElliottWavePanelPlaceholder />
          <WyckoffPanelPlaceholder />
        </div>
      </div>

      <AISignalLogPanel log={log} />
    </div>
  );
}