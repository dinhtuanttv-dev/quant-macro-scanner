"use client";
import { CheckCircle2, Clock } from "lucide-react";
import type { OrderBlock, FairValueGap, BreakOfStructure } from "@/lib/ta-command-center/detectors/smcDetector";
import type { VSASignal } from "@/lib/ta-command-center/detectors/vsaDetector";

export function SMCPanel({ obs, fvgs, bos }: { obs: OrderBlock[]; fvgs: FairValueGap[]; bos: BreakOfStructure[] }) {
  const lastOB = obs[obs.length - 1];
  return (
    <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-xl p-3">
      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">
        SMC <span className="ml-auto flex items-center gap-0.5 text-[8px] text-emerald-400"><CheckCircle2 className="w-2.5 h-2.5" />HARD_DATA</span>
      </p>
      <p className="text-sm font-black text-slate-100">{obs.length} OB · {fvgs.length} FVG · {bos.length} BOS</p>
      {lastOB && <p className="text-[9px] text-slate-500 mt-1">OB gần nhất ({lastOB.type}): {lastOB.bottom.toLocaleString()}–{lastOB.top.toLocaleString()}</p>}
    </div>
  );
}

export function VSAPanel({ signals }: { signals: VSASignal[] }) {
  const last = signals[signals.length - 1];
  return (
    <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-xl p-3">
      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">
        VSA Engine <span className="ml-auto flex items-center gap-0.5 text-[8px] text-emerald-400"><CheckCircle2 className="w-2.5 h-2.5" />HARD_DATA</span>
      </p>
      {last ? (
        <>
          <p className="text-sm font-black text-slate-100">{last.type}</p>
          <p className="text-[9px] text-slate-500 mt-1">Vol {last.volumeRatio}x TB · Spread {last.spreadRatio}x TB — ngày {last.date}</p>
        </>
      ) : <p className="text-[10px] text-slate-600 italic">Chưa phát hiện tín hiệu VSA nào gần đây.</p>}
    </div>
  );
}

export function ElliottWavePanelPlaceholder() {
  return (
    <div style={{ background: "rgba(2,6,15,0.4)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-3 opacity-60">
      <p className="text-[10px] font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
        Elliott Wave <span className="ml-auto flex items-center gap-0.5 text-[8px] text-amber-400"><Clock className="w-2.5 h-2.5" />Giai đoạn 2</span>
      </p>
      <p className="text-[10px] text-slate-600 italic">Đếm sóng mang tính chủ quan cao — sẽ triển khai bản heuristic riêng, có cảnh báo rõ ràng.</p>
    </div>
  );
}

export function WyckoffPanelPlaceholder() {
  return (
    <div style={{ background: "rgba(2,6,15,0.4)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-3 opacity-60">
      <p className="text-[10px] font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
        Wyckoff Cycle <span className="ml-auto flex items-center gap-0.5 text-[8px] text-amber-400"><Clock className="w-2.5 h-2.5" />Giai đoạn 2</span>
      </p>
      <p className="text-[10px] text-slate-600 italic">Xác định pha Wyckoff cần bối cảnh rộng — sẽ triển khai dạng ước tính, có cảnh báo rõ ràng.</p>
    </div>
  );
}