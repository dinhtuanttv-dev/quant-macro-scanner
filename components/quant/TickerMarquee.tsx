"use client";

import { useState, useEffect } from "react";
import { Play, Pause } from "lucide-react";
import { initialTickerData } from "@/lib/quant-data";

export default function TickerMarquee() {
  const [tickerData, setTickerData] = useState(initialTickerData);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setTickerData((prev) =>
        prev.map((t) => {
          const delta = (Math.random() - 0.5) * 0.15;
          return {
            ...t,
            value: Math.round(t.value * (1 + delta / 100) * 100) / 100,
            change: parseFloat((t.change + delta).toFixed(2)),
          };
        })
      );
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{ background: "#05080f", borderBottom: "1px solid rgba(245,158,11,0.15)" }}
      className="sticky top-0 z-50 overflow-hidden relative group"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex items-center">
        <div
          style={{ background: "linear-gradient(90deg, #05080f 60%, transparent)" }}
          className="absolute left-0 top-0 bottom-0 w-16 z-10 pointer-events-none flex items-center pl-2"
        >
          <button
            onClick={() => setPaused((p) => !p)}
            className="text-amber-400 hover:text-amber-300 transition pointer-events-auto"
          >
            {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
        </div>
        <div
          style={{ background: "linear-gradient(270deg, #05080f 60%, transparent)" }}
          className="absolute right-0 top-0 bottom-0 w-10 z-10 pointer-events-none"
        ></div>

        <div
          className="flex whitespace-nowrap py-2 animate-marquee"
          style={{ animationPlayState: paused ? "paused" : "running" }}
        >
          {[...tickerData, ...tickerData].map((t, i) => (
            <div key={i} className="flex items-center gap-2 px-5 text-xs shrink-0">
              <span className="text-slate-400 font-semibold">{t.name}</span>
              <span className="text-slate-100 font-mono font-bold">
                {t.prefix || ""}
                {t.value.toLocaleString()}
                {t.suffix || ""}
              </span>
              <span
                className={`font-mono font-bold flex items-center gap-0.5 ${
                  t.change >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {t.change >= 0 ? "▲" : "▼"} {t.change >= 0 ? "+" : ""}
                {t.change}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}