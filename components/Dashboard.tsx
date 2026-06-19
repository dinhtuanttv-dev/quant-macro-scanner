"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Globe,
  ShieldAlert,
  Award,
  Sliders,
  Cpu,
  Zap,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Calculator,
  AlertTriangle,
  BookOpen,
  PieChart,
  Layers,
  CheckCircle2,
  Coins,
  MessageCircle,
  X,
  Send,
  Pause,
  Play,
  XCircle,
  Clock,
  ShieldCheck,
  Filter,
} from "lucide-react";

import {
  initialTickerData,
  stockUniverse,
  globalIndicesSectors,
  commoditiesImpact,
  sectorsData,
  blackSwans,
  rrgSectors,
  eliteDetailMap,
  liveMacroNewsSentiment,
} from "@/lib/data";
import { runFullFunnel } from "@/lib/funnel";
import {
  TickerItem,
  UniverseStock,
  ConfluenceStock,
  ChatMessage,
  TabId,
  SelectedStockView,
  RebalanceLogEntry,
  KellyCalculation,
  ValuationRow,
} from "@/lib/types";

// ============================================================
// SMALL VISUAL HELPERS
// ============================================================

function renderSpiderChart(radar: {
  macro: number;
  flow: number;
  tech: number;
  sentiment: number;
}) {
  const axes = [
    { key: "macro", label: "Vĩ mô" },
    { key: "flow", label: "Dòng tiền" },
    { key: "tech", label: "Kỹ thuật" },
    { key: "sentiment", label: "Tâm lý" },
  ] as const;
  const cx = 100,
    cy = 100,
    maxR = 68;
  const angleStep = (Math.PI * 2) / axes.length;
  const points = axes.map((axis, i) => {
    const angle = -Math.PI / 2 + i * angleStep;
    const value = radar[axis.key] / 100;
    const r = maxR * value;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      labelX: cx + (maxR + 26) * Math.cos(angle),
      labelY: cy + (maxR + 26) * Math.sin(angle),
      value: radar[axis.key],
      label: axis.label,
    };
  });
  const gridLevels = [0.25, 0.5, 0.75, 1];
  const polygonPoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg viewBox="0 0 200 200" className="w-full h-52">
      <defs>
        <radialGradient id="radarFill" cx="50%" cy="50%" r="65%">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.08" />
        </radialGradient>
      </defs>
      {gridLevels.map((lvl, i) => {
        const gridPts = axes
          .map((axis, ai) => {
            const angle = -Math.PI / 2 + ai * angleStep;
            const r = maxR * lvl;
            return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
          })
          .join(" ");
        return <polygon key={i} points={gridPts} fill="none" stroke="#1e293b" strokeWidth="1" />;
      })}
      {axes.map((axis, i) => {
        const angle = -Math.PI / 2 + i * angleStep;
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={cx + maxR * Math.cos(angle)}
            y2={cy + maxR * Math.sin(angle)}
            stroke="#1e293b"
            strokeWidth="1"
          />
        );
      })}
      <polygon points={polygonPoints} fill="url(#radarFill)" stroke="#f59e0b" strokeWidth="2" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#fbbf24" stroke="#0a0f1e" strokeWidth="1.5" />
      ))}
      {points.map((p, i) => (
        <text
          key={i}
          x={p.labelX}
          y={p.labelY}
          fill="#94a3b8"
          fontSize="9.5"
          fontWeight="700"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {p.label}
        </text>
      ))}
      {points.map((p, i) => (
        <text
          key={`v-${i}`}
          x={p.labelX}
          y={p.labelY + 12}
          fill="#f59e0b"
          fontSize="9"
          fontWeight="800"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {p.value}
        </text>
      ))}
    </svg>
  );
}

function renderFearGreedGauge(value: number) {
  const cx = 110,
    cy = 100,
    r = 80;
  const startAngle = Math.PI;
  const valueAngle = startAngle - (value / 100) * Math.PI;
  const polarToCartesian = (angle: number) => ({
    x: cx + r * Math.cos(angle),
    y: cy - r * Math.sin(angle),
  });
  const segments = [
    { from: 0, to: 33, color: "#ef4444" },
    { from: 33, to: 66, color: "#fbbf24" },
    { from: 66, to: 100, color: "#34d399" },
  ];
  const arcPath = (fromPct: number, toPct: number) => {
    const a1 = startAngle - (fromPct / 100) * Math.PI;
    const a2 = startAngle - (toPct / 100) * Math.PI;
    const p1 = polarToCartesian(a1);
    const p2 = polarToCartesian(a2);
    return `M ${p1.x} ${p1.y} A ${r} ${r} 0 0 1 ${p2.x} ${p2.y}`;
  };
  const needle = polarToCartesian(valueAngle);

  return (
    <svg viewBox="0 0 220 130" className="w-full h-32">
      {segments.map((seg, i) => (
        <path
          key={i}
          d={arcPath(seg.from, seg.to)}
          fill="none"
          stroke={seg.color}
          strokeWidth="14"
          strokeLinecap="round"
          opacity="0.85"
        />
      ))}
      <line x1={cx} y1={cy} x2={needle.x} y2={needle.y} stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="6" fill="#f59e0b" stroke="#0a0f1e" strokeWidth="2" />
      <text x={cx} y={cy + 28} textAnchor="middle" fill="#fbbf24" fontSize="22" fontWeight="800">
        {value}
      </text>
      <text x={cx} y={cy + 44} textAnchor="middle" fill="#64748b" fontSize="9" fontWeight="700">
        / 100
      </text>
    </svg>
  );
}

function FunnelBadge({
  tang1Tickers,
  tang2Tickers,
  tang3Tickers,
  tang4Tickers,
  ticker,
}: {
  tang1Tickers: Set<string>;
  tang2Tickers: Set<string>;
  tang3Tickers: Set<string>;
  tang4Tickers: Set<string>;
  ticker: string;
}) {
  const labels = [
    { active: tang1Tickers.has(ticker), label: "T1" },
    { active: tang2Tickers.has(ticker), label: "T2" },
    { active: tang3Tickers.has(ticker), label: "T3" },
    { active: tang4Tickers.has(ticker), label: "T4" },
  ];
  return (
    <div className="flex gap-1">
      {labels.map((l, i) => (
        <span
          key={i}
          style={
            l.active
              ? { background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.4)", color: "#34d399" }
              : { background: "rgba(100,116,139,0.08)", border: "1px solid rgba(100,116,139,0.2)", color: "#64748b" }
          }
          className="text-[8px] font-black px-1.5 py-0.5 rounded"
        >
          {l.label}
        </span>
      ))}
    </div>
  );
}

// ============================================================
// MAIN DASHBOARD COMPONENT
// ============================================================

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabId>("scanner");
  const [scannerProgress, setScannerProgress] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState("");

  const [marketBias, setMarketBias] = useState<"Bullish" | "Bearish">("Bullish");
  const [focusSector, setFocusSector] = useState("All");

  const [aiReport, setAiReport] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  const [selectedStockId, setSelectedStockId] = useState("FPT");
  const [taMode, setTaMode] = useState("VCP");
  const [quantRadarTab, setQuantRadarTab] = useState<"golden" | "beartrap" | "foreign">("golden");
  const [selectedRrgSector, setSelectedRrgSector] = useState("Công nghệ");

  const [totalCapital, setTotalCapital] = useState(1000000000);
  const [expectedWinRate, setExpectedWinRate] = useState(55);
  const [kellyFraction, setKellyFraction] = useState(0.5);

  const [activeNewsId, setActiveNewsId] = useState(1);

  const [tickerData, setTickerData] = useState<TickerItem[]>(initialTickerData);
  const [tickerPaused, setTickerPaused] = useState(false);

  const [updatingTab, setUpdatingTab] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Record<string, Date>>({
    scanner: new Date(),
    commodity: new Date(),
    sectors: new Date(),
    ta: new Date(),
    elite: new Date(),
  });

  const [universe, setUniverse] = useState<UniverseStock[]>(stockUniverse);
  const [daysInEliteMap] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    ["FPT", "PVS", "TCB", "HAH", "DGC", "GVR", "MWG", "STB", "NLG", "HPG"].forEach((tk, idx) => {
      init[tk] = 45 - idx * 3;
    });
    return init;
  });
  const [rebalanceLog, setRebalanceLog] = useState<RebalanceLogEntry[]>([]);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Xin chào! Tôi là trợ lý CIO AI. Bạn có thể hỏi tôi về dữ liệu đang hiển thị, chiến lược đầu tư, hoặc tin tức thị trường mới nhất.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // ===== Funnel computation (memoized) =====
  const funnel = useMemo(() => runFullFunnel(universe), [universe]);
  const { tang1, tang2, tang3, tang4, confluence, eliteTop10, reserve11 } = funnel;

  const tang1Tickers = useMemo(() => new Set(tang1.map((s) => s.ticker)), [tang1]);
  const tang2Tickers = useMemo(() => new Set(tang2.map((s) => s.ticker)), [tang2]);
  const tang3Tickers = useMemo(() => new Set(tang3.map((s) => s.ticker)), [tang3]);
  const tang4Tickers = useMemo(() => new Set(tang4.map((s) => s.ticker)), [tang4]);

  // ===== Auto rebalance: flag broken MA50 in elite top 10 =====
  useEffect(() => {
    const broken = eliteTop10.find((s) => s.taData?.ma50Status === "broken");
    if (broken && reserve11) {
      setRebalanceLog((prev) => {
        const alreadyLogged = prev.some(
          (l) => l.removed === broken.ticker && l.added === reserve11.ticker
        );
        if (alreadyLogged) return prev;
        return [
          {
            time: new Date().toLocaleTimeString(),
            removed: broken.ticker,
            added: reserve11.ticker,
            reason: "Vi phạm hỗ trợ kỹ thuật MA50",
          },
          ...prev,
        ].slice(0, 5);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eliteTop10, reserve11]);

  const commodityFavoredTickers = useMemo(() => {
    const favored = new Set<string>();
    commoditiesImpact.forEach((comm) => {
      if (comm.trend === "Up") {
        universe.filter((u) => u.sector === comm.sectorFavored).forEach((u) => favored.add(u.ticker));
      }
    });
    return favored;
  }, [universe]);

  const globalFavoredTickers = useMemo(() => {
    const favored = new Set<string>();
    const favoredSectors = new Set<string>();
    globalIndicesSectors.forEach((item) => item.vnSectorsFavored.forEach((s) => favoredSectors.add(s)));
    universe.filter((u) => favoredSectors.has(u.sector)).forEach((u) => favored.add(u.ticker));
    return favored;
  }, [universe]);

  const selectedStock: SelectedStockView | null = useMemo(() => {
    const conf = confluence.find((s) => s.ticker === selectedStockId);
    const detail = eliteDetailMap[selectedStockId];
    if (!conf && !detail) return null;
    return {
      ticker: selectedStockId,
      sector: conf?.sector || universe.find((u) => u.ticker === selectedStockId)?.sector || "—",
      score: conf?.finalScore ?? 0,
      matchCount: conf?.matchCount ?? 0,
      entry: detail ? detail.entry.toLocaleString() : "—",
      target: detail ? detail.target.toLocaleString() : "—",
      stoploss: detail ? detail.stoploss.toLocaleString() : "—",
      weight: detail?.weight ?? "—",
      radar: detail?.radar ?? { macro: 70, flow: 70, tech: 70, sentiment: 70 },
      reason:
        detail?.reason ??
        "Cổ phiếu đang trong danh sách theo dõi mở rộng, chưa có đầy đủ luận điểm chi tiết.",
      pattern: conf?.taData?.pattern ?? "—",
      rr: detail ? ((detail.target - detail.entry) / (detail.entry - detail.stoploss)).toFixed(2) : "—",
    };
  }, [selectedStockId, confluence, universe]);

  const aiValuationMatrix: ValuationRow[] = useMemo(() => {
    const multiplier = marketBias === "Bullish" ? 1.15 : 0.95;
    return eliteTop10.map((stock) => {
      const detail = eliteDetailMap[stock.ticker];
      const entryNum = detail ? detail.entry : 50000;
      const rawFairValue = entryNum * ((stock.finalScore || 70) / 80) * multiplier;
      const fairValue = Math.round(rawFairValue / 100) * 100;
      const marginOfSafety = ((fairValue - entryNum) / fairValue) * 100;
      return {
        ticker: stock.ticker,
        current: entryNum.toLocaleString(),
        fairValue: fairValue.toLocaleString(),
        mos: marginOfSafety.toFixed(1),
        status:
          marginOfSafety > 15 ? "Siêu Hấp Dẫn" : marginOfSafety > 5 ? "Hợp Lý" : "Cần Chờ Điều Chỉnh",
      };
    });
  }, [marketBias, eliteTop10]);

  const activeNewsDetails =
    liveMacroNewsSentiment.find((n) => n.id === activeNewsId) || liveMacroNewsSentiment[0];

  const actionableSignals = eliteTop10.slice(0, 4).map((s) => ({
    ticker: s.ticker,
    action: s.taData?.breakout ? "MUA TÍCH LŨY" : "QUAN SÁT TẠO ĐÁY",
    confidence: `${Math.min(96, Math.round(60 + s.finalScore / 3))}%`,
    zone: eliteDetailMap[s.ticker]
      ? `${(eliteDetailMap[s.ticker].entry * 0.98).toLocaleString()} - ${eliteDetailMap[
          s.ticker
        ].entry.toLocaleString()}`
      : "—",
    status: s.taData?.breakout ? "Kích hoạt" : "Đợi xác nhận",
  }));

  const kellyCalculation: KellyCalculation = useMemo(() => {
    if (!selectedStock || selectedStock.entry === "—")
      return { rrRatio: "0", rawKelly: "0", allocatedPercentage: "0", allocatedCapital: 0, shares: 0, maxRiskCapital: 0 };
    const entry = parseFloat(selectedStock.entry.replace(/,/g, ""));
    const target = parseFloat(selectedStock.target.replace(/,/g, ""));
    const stoploss = parseFloat(selectedStock.stoploss.replace(/,/g, ""));
    const reward = target - entry;
    const risk = entry - stoploss;
    const b = risk > 0 ? reward / risk : 3.0;
    const p = expectedWinRate / 100;
    let fStar = b > 0 ? (p * (b + 1) - 1) / b : 0;
    if (fStar < 0) fStar = 0;
    const activeFraction = fStar * kellyFraction;
    const capitalAllocated = totalCapital * activeFraction;
    const sharesAllocated = Math.floor(capitalAllocated / entry);
    return {
      rrRatio: b.toFixed(2),
      rawKelly: (fStar * 100).toFixed(1),
      allocatedPercentage: (activeFraction * 100).toFixed(1),
      allocatedCapital: Math.round(capitalAllocated),
      shares: sharesAllocated,
      maxRiskCapital: Math.round(capitalAllocated * (risk / entry)),
    };
  }, [selectedStock, totalCapital, expectedWinRate, kellyFraction]);

  // ===== Ticker marquee auto random-walk =====
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

  // ===== Generic "update data" handler per tab =====
  const handleUpdateTabData = (tabKey: string) => {
    setUpdatingTab(tabKey);
    setTimeout(() => {
      setUniverse((prev) =>
        prev.map((s) => ({
          ...s,
          epsGrowth: parseFloat((s.epsGrowth + (Math.random() - 0.45) * 1.8).toFixed(1)),
          faScore: Math.max(30, Math.min(99, Math.round(s.faScore + (Math.random() - 0.45) * 3))),
        }))
      );
      setTickerData((prev) =>
        prev.map((t) => {
          const delta = (Math.random() - 0.5) * 0.3;
          return {
            ...t,
            value: Math.round(t.value * (1 + delta / 100) * 100) / 100,
            change: parseFloat((t.change + delta).toFixed(2)),
          };
        })
      );
      setLastUpdated((prev) => ({ ...prev, [tabKey]: new Date() }));
      setUpdatingTab(null);
    }, 900);
  };

  const getMockCioReport = (bias: string, sector: string) => {
    const top4 = eliteTop10.slice(0, 4);
    const lines = top4
      .map((s, i) => {
        const d = eliteDetailMap[s.ticker];
        if (!d) return "";
        return `${i + 1}. ${s.ticker}* (${s.sector} - Tỷ trọng ${d.weight}): Khớp ${s.matchCount}/4 tầng lọc, điểm hợp lưu ${s.finalScore}
   Điểm mua: ${Math.round(d.entry * 0.98).toLocaleString()} - ${d.entry.toLocaleString()} | Chốt lời: ${d.target.toLocaleString()} | Dừng lỗ: ${d.stoploss.toLocaleString()}`;
      })
      .join("\n");

    return `[BAO CAO CIO CHIEN LUOC] GLOBAL QUANT-MACRO & MARKET SCANNER
Tac gia: Dinh Cong Tuan (CIO)
Trang thai kich hoat: ${bias} Bias | Nganh tieu diem: ${sector}
Thoi gian lap bao cao: ${new Date().toLocaleString()}

=== PHEU LOC 4 TANG: TU 60 MA XUONG ELITE 10 ===
Tang 1 (Sieu quet AI - FA & EPS Growth): ${tang1.length} ma duoc giu lai tu vu tru 60 ma.
Tang 2 (Ket noi the gioi - dong thuan nganh & hang hoa): ${tang2.length} ma dong pha voi 10 chi so lon nhat va hang hoa toan cau.
Tang 3 (Suc manh xung luc nganh): ${tang3.length} ma thuoc nhom nganh co xung luc chinh sach/dong tien manh nhat.
Tang 4 (TA VN-Index - Breakout/Pullback/Volume + Dong tien ngoai): ${tang4.length} ma hoi tu ky thuat va dong tien khoi ngoai.

=== CONFLUENCE SCORING ===
Cac ma xuat hien dong thoi trong ca 4 tang duoc cong diem thuong toi da +25 diem hop luu. Danh sach Elite 10 hien tai:
${eliteTop10.map((s) => `- ${s.ticker}: khop ${s.matchCount}/4 tang, diem cuoi ${s.finalScore}`).join("\n")}

${
  reserve11
    ? `Ma du phong #11: ${reserve11.ticker} (diem ${reserve11.finalScore}) - san sang thay the neu co ma trong Top 10 vi pham MA50.`
    : ""
}

=== TOP 4 KHUYEN NGHI HANH DONG ===
${lines}

=== KICH BAN "NEU - THI" ===
- Kich ban Co so (70%): cac hang hoa chu dao va chi so chung khoan the gioi tiep tuc but pha, danh muc Elite 10 duy tri on dinh.
- Kich ban Rui ro (30%): ty gia leo doc, khoi ngoai ban rong manh, he thong se kich hoat tai co cau tu dong neu phat hien vi pham MA50.`;
  };

  const handleRunLiveScanner = async () => {
    setIsScanning(true);
    setScannerProgress(5);
    setScanStep("Mở giao thức Real-Time: Quét vũ trụ 60 mã, chỉ số thế giới, hàng hóa, tin tức vĩ mô...");
    const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

    await delay(600);
    setScannerProgress(20);
    setScanStep("TẦNG 1: Lọc theo Giá trị nội tại (FA) và Đà tăng trưởng EPS — giữ lại 20 mã...");

    await delay(600);
    setScannerProgress(40);
    setScanStep("TẦNG 2: Quét đồng thuận ngành thế giới & hàng hóa toàn cầu — giữ lại 20 mã đồng pha...");

    await delay(600);
    setScannerProgress(60);
    setScanStep("TẦNG 3: Lọc theo sức mạnh xung lực nhóm ngành Việt Nam — giữ lại 20 mã...");

    await delay(600);
    setScannerProgress(80);
    setScanStep("TẦNG 4: Phân tích kỹ thuật hội tụ dòng tiền lớn (Breakout/Pullback/Volume) + dòng tiền khối ngoại...");

    await delay(600);
    setScannerProgress(92);
    setScanStep("Tính Trọng số Đồng thuận (Confluence Weighting) & kiểm tra Dynamic Rebalancing MA50...");

    setIsAiLoading(true);
    setAiError("");
    await delay(800);
    setAiReport(getMockCioReport(marketBias, focusSector));
    setAiError(
      "Báo cáo được tạo bởi mô hình phân tích nội bộ (offline simulation) — không sử dụng dịch vụ AI ngoài."
    );
    setIsScanning(false);
    setIsAiLoading(false);
    setScannerProgress(100);
    setLastUpdated((prev) => ({ ...prev, scanner: new Date() }));
  };

  // ===== Chat AI handler: calls internal /api/chat route (server-side proxy) =====
  const handleSendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setChatLoading(true);

    try {
      const contextSummary = `Tab đang xem = ${activeTab}. Elite 10 hiện tại: ${eliteTop10
        .map((s) => s.ticker)
        .join(", ")}. Mã đang chọn: ${selectedStockId}. Xu hướng thị trường: ${marketBias}.`;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          context: contextSummary,
        }),
      });

      const data = await response.json();
      const replyText = data.reply || "Xin lỗi, tôi không nhận được phản hồi hợp lệ. Vui lòng thử lại.";
      setChatMessages((prev) => [...prev, { role: "assistant", text: replyText }]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Không thể kết nối tới dịch vụ AI lúc này. Vui lòng thử lại sau." },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, chatOpen]);

  const formatTimeAgo = (date: Date) => {
    const secs = Math.round((Date.now() - date.getTime()) / 1000);
    if (secs < 60) return `${secs}s trước`;
    const mins = Math.round(secs / 60);
    if (mins < 60) return `${mins} phút trước`;
    return date.toLocaleTimeString();
  };

  return (
    <div style={{ background: "#070b14" }} className="min-h-screen text-slate-100 font-sans flex flex-col antialiased relative">
      {/* ============ TICKER MARQUEE ============ */}
      <div
        style={{ background: "#05080f", borderBottom: "1px solid rgba(245,158,11,0.15)" }}
        className="sticky top-0 z-50 overflow-hidden relative"
        onMouseEnter={() => setTickerPaused(true)}
        onMouseLeave={() => setTickerPaused(false)}
      >
        <div className="flex items-center">
          <div
            style={{ background: "linear-gradient(90deg, #05080f 60%, transparent)" }}
            className="absolute left-0 top-0 bottom-0 w-16 z-10 pointer-events-none flex items-center pl-2"
          >
            <button
              onClick={() => setTickerPaused((p) => !p)}
              className="text-amber-400 hover:text-amber-300 transition pointer-events-auto"
              title={tickerPaused ? "Tiếp tục chạy" : "Tạm dừng"}
            >
              {tickerPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div
            style={{ background: "linear-gradient(270deg, #05080f 60%, transparent)" }}
            className="absolute right-0 top-0 bottom-0 w-10 z-10 pointer-events-none"
          ></div>

          <div
            className={`flex whitespace-nowrap py-2 animate-marquee ${tickerPaused ? "animate-marquee-paused" : ""}`}
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

      {/* Header */}
      <header
        style={{
          background: "linear-gradient(180deg, #0d1424 0%, #0a0f1e 100%)",
          borderBottom: "1px solid rgba(245,158,11,0.12)",
        }}
        className="px-6 py-4 sticky top-[33px] z-40 shadow-2xl backdrop-blur"
      >
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              style={{
                background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #10b981 100%)",
                boxShadow: "0 0 24px rgba(245,158,11,0.35)",
              }}
              className="p-2.5 rounded-xl"
            >
              <Cpu className="w-7 h-7 text-slate-950" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-wide text-slate-50 flex items-center gap-2">
                GLOBAL QUANT-MACRO & MARKET SCANNER
                <span
                  style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)" }}
                  className="text-[10px] text-amber-400 px-2.5 py-0.5 rounded-full font-bold tracking-wider"
                >
                  CIO ENGINE
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Chuyên gia phân tích liên thị trường & Momentum Trading • Tác giả:{" "}
                <span className="text-amber-400 font-semibold">Đinh Công Tuấn</span>
              </p>
            </div>
          </div>

          <button
            onClick={() => setChatOpen(true)}
            style={{
              background: "linear-gradient(135deg, rgba(245,158,11,0.14), rgba(16,185,129,0.1))",
              border: "1px solid rgba(245,158,11,0.3)",
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-amber-400 hover:brightness-110 transition"
          >
            <MessageCircle className="w-4 h-4" />
            Hỏi Trợ Lý CIO AI
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        <section className="lg:col-span-1 flex flex-col gap-6">
          <div
            style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }}
            className="rounded-2xl p-5 shadow-xl"
          >
            <h2 className="text-sm font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2 mb-4">
              <SlidersHorizontal className="w-4 h-4 text-amber-500" />
              Cấu hình thông số CIO
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  Xu Hướng Thị Trường Kỳ Vọng
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setMarketBias("Bullish")}
                    style={
                      marketBias === "Bullish"
                        ? { background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.5)" }
                        : { border: "1px solid rgba(148,163,184,0.15)" }
                    }
                    className={`px-3 py-2 text-xs font-bold rounded-lg transition ${
                      marketBias === "Bullish" ? "text-emerald-400" : "bg-slate-950/60 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Tăng trưởng (Bullish)
                  </button>
                  <button
                    onClick={() => setMarketBias("Bearish")}
                    style={
                      marketBias === "Bearish"
                        ? { background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.5)" }
                        : { border: "1px solid rgba(148,163,184,0.15)" }
                    }
                    className={`px-3 py-2 text-xs font-bold rounded-lg transition ${
                      marketBias === "Bearish" ? "text-red-400" : "bg-slate-950/60 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Phòng thủ (Bearish)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Ngành Tiêu Điểm Tập Trung</label>
                <select
                  value={focusSector}
                  onChange={(e) => setFocusSector(e.target.value)}
                  style={{ border: "1px solid rgba(148,163,184,0.15)" }}
                  className="w-full bg-slate-950/60 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="All">--- Tất cả các ngành ---</option>
                  <option value="Công nghệ">Công nghệ & AI (FPT)</option>
                  <option value="Dầu khí">Dầu khí & Thượng nguồn (PVS, PVD)</option>
                  <option value="Ngân hàng">Ngân hàng (TCB, STB)</option>
                  <option value="Vận tải biển">Vận tải biển (HAH, GMD)</option>
                  <option value="Cao su">Cao su & Khu công nghiệp (GVR, PHR)</option>
                  <option value="Bất động sản">Bất động sản (NLG, KDH)</option>
                </select>
              </div>

              <button
                onClick={handleRunLiveScanner}
                disabled={isScanning}
                style={{
                  background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
                  boxShadow: "0 4px 20px rgba(245,158,11,0.25)",
                }}
                className="w-full text-slate-950 font-black py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition duration-200 text-xs disabled:opacity-50 hover:brightness-110 active:scale-[0.98]"
              >
                <Sparkles className="w-4 h-4 text-slate-950 animate-pulse" />
                {isScanning ? "ĐANG QUÉT PHỄU 4 TẦNG..." : "KÍCH HOẠT SIÊU CẦU LỆNH"}
              </button>
            </div>
          </div>

          {/* Funnel Summary Widget */}
          <div
            style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }}
            className="rounded-2xl p-5 shadow-xl flex-1 flex flex-col"
          >
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between mb-4">
              <span className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-amber-400" />
                Phễu Lọc 4 Tầng
              </span>
              <span
                style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)" }}
                className="text-[10px] text-emerald-400 px-2 py-0.5 rounded-full font-bold"
              >
                60 → 10
              </span>
            </h2>

            <div className="space-y-2.5 flex-1">
              {[
                { label: "Vũ trụ gốc", count: universe.length, icon: Layers, color: "#64748b" },
                { label: "Tầng 1: Siêu quét AI (FA/Growth)", count: tang1.length, icon: Cpu, color: "#f59e0b" },
                { label: "Tầng 2: Kết nối thế giới", count: tang2.length, icon: Globe, color: "#38bdf8" },
                { label: "Tầng 3: Sức mạnh xung lực ngành", count: tang3.length, icon: Activity, color: "#a78bfa" },
                { label: "Tầng 4: TA + Dòng tiền ngoại", count: tang4.length, icon: TrendingUp, color: "#34d399" },
                { label: "Elite 10 (Confluence)", count: eliteTop10.length, icon: Award, color: "#fbbf24" },
              ].map((row, i) => {
                const Icon = row.icon;
                return (
                  <div
                    key={i}
                    style={{ background: "rgba(2,6,15,0.5)", border: "1px solid rgba(148,163,184,0.08)" }}
                    className="flex items-center justify-between p-2.5 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5" style={{ color: row.color }} />
                      <span className="text-[11px] text-slate-300 font-semibold">{row.label}</span>
                    </div>
                    <span className="text-xs font-black font-mono" style={{ color: row.color }}>
                      {row.count}
                    </span>
                  </div>
                );
              })}
            </div>

            {rebalanceLog.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-800/60">
                <h3 className="text-[10px] font-bold uppercase text-red-400 mb-2 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Tái Cơ Cấu Gần Nhất
                </h3>
                <div
                  style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}
                  className="p-2.5 rounded-lg text-[10px] text-slate-300"
                >
                  <span className="text-red-400 font-bold">{rebalanceLog[0].removed}</span> bị loại (
                  {rebalanceLog[0].reason}) →{" "}
                  <span className="text-emerald-400 font-bold">{rebalanceLog[0].added}</span> được đẩy lên thay thế.
                  <div className="text-slate-500 mt-1">{rebalanceLog[0].time}</div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="lg:col-span-3 flex flex-col gap-6">
          <div
            style={{ background: "rgba(14,22,38,0.7)", border: "1px solid rgba(148,163,184,0.1)" }}
            className="flex p-1 rounded-2xl flex-wrap"
          >
            {[
              { id: "scanner" as TabId, label: "Siêu quét AI", icon: Cpu },
              { id: "commodity" as TabId, label: "Kết nối thế giới", icon: Globe },
              { id: "sectors" as TabId, label: "Bộ lọc Ngành (T1 & T2)", icon: Layers },
              { id: "ta" as TabId, label: "TA VN-Index (T3)", icon: Activity },
              { id: "elite" as TabId, label: "Elite 10 (T4)", icon: Award },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={
                    isActive
                      ? {
                          background: "linear-gradient(135deg, rgba(245,158,11,0.16), rgba(16,185,129,0.08))",
                          boxShadow: "inset 0 0 0 1px rgba(245,158,11,0.3)",
                        }
                      : {}
                  }
                  className={`flex-1 min-w-[120px] py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all duration-200 ${
                    isActive ? "text-amber-400" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/30"
                  }`}
                >
                  <Icon className="w-4 h-4" style={{ color: isActive ? "#f59e0b" : undefined }} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {activeTab !== "elite" && (
            <div className="flex items-center justify-between -mb-2">
              <span className="text-[10px] text-slate-500">
                Cập nhật lần cuối: <b className="text-slate-400">{formatTimeAgo(lastUpdated[activeTab])}</b>
              </span>
              <button
                onClick={() => handleUpdateTabData(activeTab)}
                disabled={updatingTab === activeTab}
                style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)" }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-emerald-400 hover:brightness-110 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${updatingTab === activeTab ? "animate-spin" : ""}`} />
                {updatingTab === activeTab ? "Đang cập nhật..." : "Cập nhật dữ liệu"}
              </button>
            </div>
          )}

          {activeTab === "scanner" && (
            <div className="space-y-6">
              {isScanning && (
                <div
                  style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(245,158,11,0.25)" }}
                  className="rounded-2xl p-5"
                >
                  <div className="flex justify-between text-xs text-amber-400 font-bold mb-2">
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
                      HỆ THỐNG ĐANG QUÉT PHỄU LỌC 4 TẦNG...
                    </span>
                    <span className="font-mono">{scannerProgress}%</span>
                  </div>
                  <div
                    style={{ background: "rgba(2,6,15,0.8)", border: "1px solid rgba(148,163,184,0.1)" }}
                    className="w-full h-2 rounded-full overflow-hidden"
                  >
                    <div
                      style={{
                        background: "linear-gradient(90deg, #fbbf24, #10b981)",
                        boxShadow: "0 0 8px rgba(245,158,11,0.5)",
                        width: `${scannerProgress}%`,
                      }}
                      className="h-full transition-all duration-300"
                    ></div>
                  </div>
                  <p className="text-xs text-slate-400 mt-3 font-mono">
                    <b className="text-amber-500">Log:</b> {scanStep}
                  </p>
                </div>
              )}

              <div
                style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }}
                className="rounded-2xl p-6 shadow-xl relative overflow-hidden"
              >
                <div
                  style={{ background: "radial-gradient(circle, rgba(245,158,11,0.08), transparent 70%)" }}
                  className="absolute top-0 right-0 w-64 h-64 rounded-full -z-0"
                ></div>
                <div className="flex items-center justify-between border-b border-slate-800/60 pb-4 mb-5 relative z-10">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-amber-500" />
                    <h3 className="font-bold text-base text-slate-100">Báo Cáo CIO Độc Quyền (Đinh Công Tuấn)</h3>
                  </div>
                  <span
                    style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.35)" }}
                    className="text-[10px] uppercase font-bold text-emerald-400 px-3 py-1 rounded-full flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-3 h-3" /> Phân tích hợp lệ
                  </span>
                </div>

                {isAiLoading ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-3">
                    <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
                    <span className="text-xs text-slate-400 font-semibold">
                      Đang tổng hợp dữ liệu phễu lọc 4 tầng và viết báo cáo chiến lược...
                    </span>
                  </div>
                ) : (
                  <article className="prose prose-invert max-w-none text-slate-300 text-sm leading-relaxed space-y-4 relative z-10">
                    {aiError && (
                      <div
                        style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}
                        className="mb-4 p-3 text-amber-300 text-xs rounded-lg flex items-start gap-2"
                      >
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <span>{aiError}</span>
                      </div>
                    )}
                    {aiReport ? (
                      <div
                        style={{ background: "rgba(2,6,15,0.55)", border: "1px solid rgba(148,163,184,0.1)" }}
                        className="prose-cio p-5 rounded-xl font-normal font-sans"
                      >
                        {aiReport}
                      </div>
                    ) : (
                      <div
                        style={{ background: "rgba(2,6,15,0.55)", border: "1px solid rgba(148,163,184,0.1)" }}
                        className="text-slate-500 text-xs italic p-5 rounded-xl"
                      >
                        Nhấn "KÍCH HOẠT SIÊU CẦU LỆNH" để hệ thống chạy phễu lọc 4 tầng và tạo báo cáo phân tích chiến lược CIO.
                      </div>
                    )}
                  </article>
                )}
              </div>

              <div
                style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }}
                className="rounded-2xl p-5 shadow-xl"
              >
                <h4 className="text-xs font-black text-slate-100 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-amber-500" />
                  Tầng 1: Siêu Quét AI — Top 20 theo FA & EPS Growth
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800/60 text-slate-400 text-[10px] uppercase">
                        <th className="pb-2">Mã</th>
                        <th className="pb-2">Ngành</th>
                        <th className="pb-2 text-right">EPS Growth</th>
                        <th className="pb-2 text-right">FA Score</th>
                        <th className="pb-2 text-right">Điểm Tầng 1</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/30">
                      {tang1.slice(0, 8).map((s, i) => (
                        <tr
                          key={i}
                          onClick={() => {
                            setSelectedStockId(s.ticker);
                            setActiveTab("elite");
                          }}
                          className="hover:bg-slate-800/20 transition cursor-pointer"
                        >
                          <td className="py-2 font-black text-amber-400">{s.ticker}</td>
                          <td className="py-2 text-slate-300">{s.sector}</td>
                          <td className="py-2 text-right text-emerald-400 font-mono">+{s.epsGrowth}%</td>
                          <td className="py-2 text-right text-slate-200 font-mono">{s.faScore}</td>
                          <td className="py-2 text-right text-amber-400 font-bold font-mono">{s.tang1Score.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-slate-500 mt-2">Hiển thị 8/20 mã. Xem đầy đủ tại tab Elite 10.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div
                  style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }}
                  className="rounded-2xl p-5 shadow-xl flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center gap-1.5 border-b border-slate-800/60 pb-3 mb-4">
                      <Zap className="text-amber-500 animate-pulse w-4 h-4" />
                      <h4 className="text-xs font-black text-slate-100 uppercase tracking-wider">Chiến Lược Hành Động Tức Thời</h4>
                    </div>
                    <div className="space-y-3">
                      {actionableSignals.map((sig, sIdx) => (
                        <div
                          key={sIdx}
                          onClick={() => {
                            setSelectedStockId(sig.ticker);
                            setActiveTab("elite");
                          }}
                          style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }}
                          className="p-3 rounded-xl hover:border-amber-500/50 transition cursor-pointer flex flex-col gap-1.5"
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-extrabold text-sm text-slate-200">{sig.ticker}</span>
                            <span
                              style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)" }}
                              className="text-[10px] text-amber-400 px-2 py-0.5 rounded-full font-bold"
                            >
                              Tin cậy: {sig.confidence}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-slate-400 font-bold">{sig.action}</span>
                            <span className="text-emerald-400 font-mono">{sig.zone}</span>
                          </div>
                          <div className="text-[9px] text-slate-500 flex items-center justify-between">
                            <span>Status: {sig.status}</span>
                            <span className="text-amber-500/80">Click để giao dịch Kelly →</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div
                  style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }}
                  className="rounded-2xl p-5 shadow-xl flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center gap-1.5 border-b border-slate-800/60 pb-3 mb-4">
                      <Activity className="text-emerald-400 w-4 h-4" />
                      <h4 className="text-xs font-black text-slate-100 uppercase tracking-wider">Quét & Chấm Điểm Tin Tức Vĩ Mô 24h</h4>
                    </div>
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {liveMacroNewsSentiment.map((news) => (
                        <div
                          key={news.id}
                          onClick={() => setActiveNewsId(news.id)}
                          style={
                            activeNewsId === news.id
                              ? { background: "rgba(2,6,15,0.85)", border: "1px solid rgba(245,158,11,0.5)" }
                              : { background: "rgba(2,6,15,0.4)", border: "1px solid rgba(148,163,184,0.08)" }
                          }
                          className="p-2.5 rounded-lg text-xs cursor-pointer transition"
                        >
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[9px] font-extrabold text-slate-400">{news.type}</span>
                            <span
                              className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-full ${
                                news.impact >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                              }`}
                            >
                              {news.impact >= 0 ? `+${news.impact}` : news.impact} pts
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-200 line-clamp-1 leading-snug">{news.headline}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div
                    style={{ background: "rgba(2,6,15,0.7)", border: "1px solid rgba(148,163,184,0.1)" }}
                    className="p-2.5 rounded-lg text-[11px] mt-3"
                  >
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                      Đánh Giá Tác Động ({activeNewsDetails.relatedTicker}):
                    </span>
                    <p className="text-slate-300 font-mono leading-normal">
                      Thụ hưởng trực tiếp cho ngành <b>{activeNewsDetails.affectedSectors}</b>.
                    </p>
                  </div>
                </div>

                <div
                  style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }}
                  className="rounded-2xl p-5 shadow-xl flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center gap-1.5 border-b border-slate-800/60 pb-3 mb-4">
                      <Coins className="text-amber-500 w-4 h-4" />
                      <h4 className="text-xs font-black text-slate-100 uppercase tracking-wider">Định Giá Hợp Lý & Biên An Toàn AI</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[11px] border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800/60 text-slate-400 font-bold">
                            <th className="pb-1.5">Mã</th>
                            <th className="pb-1.5">Giá Hiện Tại</th>
                            <th className="pb-1.5">Định Giá AI</th>
                            <th className="pb-1.5 text-right">Biên An Toàn</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                          {aiValuationMatrix.slice(0, 5).map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-slate-950/50 transition">
                              <td className="py-2 font-black text-amber-400">{row.ticker}</td>
                              <td className="py-2 text-slate-300 font-mono">{row.current}đ</td>
                              <td className="py-2 text-slate-200 font-bold font-mono">{row.fairValue}đ</td>
                              <td
                                className={`py-2 text-right font-black font-mono ${
                                  parseFloat(row.mos) >= 15 ? "text-emerald-400" : "text-slate-300"
                                }`}
                              >
                                {row.mos}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "commodity" && (
            <div className="space-y-8">
              <div
                style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }}
                className="rounded-2xl p-6 shadow-xl"
              >
                <div className="border-b border-slate-800/60 pb-4 mb-5">
                  <h3 className="text-sm font-bold uppercase text-slate-100 flex items-center gap-2">
                    <Globe className="w-5 h-5 text-amber-500" />
                    10 Chỉ Số Chứng Khoán Lớn Nhất & 3 Ngành Dẫn Sóng Thế Giới
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Phân tích sự đồng pha dòng chảy nguồn vốn toàn cầu đến các nhóm ngành Việt Nam thụ hưởng.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {globalIndicesSectors.map((item, idx) => (
                    <div
                      key={idx}
                      style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }}
                      className="rounded-xl p-5 hover:border-slate-600/40 transition"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span
                          style={{ border: "1px solid rgba(148,163,184,0.15)" }}
                          className="text-xs font-bold text-slate-100 bg-slate-900/60 px-2.5 py-1 rounded"
                        >
                          {item.index}
                        </span>
                        <span
                          style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)" }}
                          className="text-[10px] uppercase font-extrabold text-amber-500 px-2.5 py-0.5 rounded-full"
                        >
                          {item.country}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 uppercase font-black tracking-wider block">
                        3 Ngành tăng mạnh nhất toàn cầu:
                      </span>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {item.sectors.map((sec, sIdx) => (
                          <span
                            key={sIdx}
                            style={{ border: "1px solid rgba(148,163,184,0.12)" }}
                            className="bg-slate-900/60 text-slate-300 text-[10px] font-bold px-2 py-1 rounded"
                          >
                            {sec}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-slate-400 mt-3.5 leading-relaxed">
                        <b className="text-slate-300">Cơ sở lý thuyết:</b> {item.rationale}
                      </p>
                      <div className="mt-4 pt-3 border-t border-slate-800/50">
                        <span className="text-[10px] text-emerald-400/80 font-bold block uppercase tracking-wider flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Ngành VN đồng pha hưởng lợi:
                        </span>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {item.vnSectorsFavored.map((sec, si) => (
                            <span
                              key={si}
                              style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)" }}
                              className="text-emerald-400 text-[10px] font-bold px-2 py-1 rounded"
                            >
                              {sec}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }}
                className="rounded-2xl p-6 shadow-xl"
              >
                <div className="border-b border-slate-800/60 pb-4 mb-5">
                  <h3 className="text-sm font-bold uppercase text-slate-100 flex items-center gap-2">
                    <Coins className="w-5 h-5 text-amber-500" />
                    Ma Trận Tác Động Giá Hàng Hóa Thế Giới
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {commoditiesImpact.map((comm) => (
                    <div
                      key={comm.id}
                      style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }}
                      className="rounded-xl p-5 hover:border-slate-600/40 transition"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span
                          style={{ border: "1px solid rgba(148,163,184,0.12)" }}
                          className="text-[10px] bg-slate-900/60 text-slate-400 px-2.5 py-0.5 rounded font-semibold"
                        >
                          {comm.category}
                        </span>
                        <span
                          className={`text-xs font-black px-2 py-0.5 rounded-full flex items-center gap-1 ${
                            comm.trend === "Up"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : comm.trend === "Neutral"
                              ? "bg-slate-800 text-slate-400"
                              : "bg-red-500/10 text-red-400"
                          }`}
                        >
                          {comm.trend === "Up" && <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />}
                          {comm.trend === "Down" && <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
                          {comm.trend} Trend
                        </span>
                      </div>
                      <h4 className="text-base font-bold text-slate-100">{comm.name}</h4>
                      <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-xl font-black text-slate-200 font-mono">{comm.price}</span>
                        <span className={`text-xs font-bold font-mono ${comm.trend === "Up" ? "text-emerald-400" : "text-slate-400"}`}>
                          {comm.change}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                        <b className="text-slate-300">Cơ chế truyền dẫn:</b> {comm.transmission}
                      </p>
                      <div className="mt-4 pt-3 border-t border-slate-800/50">
                        <span className="text-[10px] text-slate-500 font-bold block uppercase">Ngành VN thụ hưởng:</span>
                        <span
                          style={{
                            background: comm.trend === "Up" ? "linear-gradient(135deg, #fbbf24, #f59e0b)" : "rgba(148,163,184,0.1)",
                          }}
                          className={`inline-block mt-2 text-xs px-2.5 py-1 rounded-lg font-black ${
                            comm.trend === "Up" ? "text-slate-950" : "text-slate-400"
                          }`}
                        >
                          {comm.sectorFavored}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }}
                className="rounded-2xl p-5 shadow-xl"
              >
                <h4 className="text-xs font-black text-slate-100 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-sky-400" />
                  Tầng 2: Kết Nối Thế Giới — Top 20 Đồng Thuận
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800/60 text-slate-400 text-[10px] uppercase">
                        <th className="pb-2">Mã</th>
                        <th className="pb-2">Ngành</th>
                        <th className="pb-2 text-center">Đồng Pha Chỉ Số TG</th>
                        <th className="pb-2 text-center">Đồng Pha Hàng Hóa</th>
                        <th className="pb-2 text-right">Điểm Tầng 2</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/30">
                      {tang2.slice(0, 8).map((s, i) => (
                        <tr
                          key={i}
                          onClick={() => {
                            setSelectedStockId(s.ticker);
                            setActiveTab("elite");
                          }}
                          className="hover:bg-slate-800/20 transition cursor-pointer"
                        >
                          <td className="py-2 font-black text-amber-400">{s.ticker}</td>
                          <td className="py-2 text-slate-300">{s.sector}</td>
                          <td className="py-2 text-center">
                            {s.globalSync ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 text-slate-600 inline" />
                            )}
                          </td>
                          <td className="py-2 text-center">
                            {s.commoditySync ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 text-slate-600 inline" />
                            )}
                          </td>
                          <td className="py-2 text-right text-amber-400 font-bold font-mono">{s.tang2Score.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-slate-500 mt-2">Hiển thị 8/20 mã. Xem đầy đủ tại tab Elite 10.</p>
              </div>
            </div>
          )}

          {activeTab === "sectors" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div
                  style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }}
                  className="rounded-2xl p-5 shadow-xl flex flex-col justify-between"
                >
                  <h3 className="text-xs font-bold uppercase text-slate-400 mb-2 tracking-wider">Chỉ số Sợ hãi & Tham lam</h3>
                  {renderFearGreedGauge(68)}
                  <div className="flex justify-between text-[9px] text-slate-500 mt-1 font-bold px-1">
                    <span>SỢ HÃI</span>
                    <span>TRUNG LẬP</span>
                    <span>THAM LAM</span>
                  </div>
                </div>
                <div
                  style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }}
                  className="rounded-2xl p-5 shadow-xl md:col-span-2"
                >
                  <h3 className="text-xs font-bold uppercase text-slate-300 mb-3 flex items-center gap-1.5">
                    <PieChart className="w-4 h-4 text-emerald-400" />
                    Sự Đồng Pha Luồng Vốn
                  </h3>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="p-3 rounded-xl">
                      <span className="text-[10px] text-amber-500 font-bold block mb-1">Large-Cap</span>
                      <p className="text-slate-300 font-medium leading-relaxed">Trái phiếu Mỹ dài hạn & Big-Tech dẫn dắt.</p>
                    </div>
                    <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="p-3 rounded-xl">
                      <span className="text-[10px] text-amber-500 font-bold block mb-1">Mid-Cap</span>
                      <p className="text-slate-300 font-medium leading-relaxed">Bán lẻ tiêu dùng và vật liệu bán dẫn hạ nguồn.</p>
                    </div>
                    <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="p-3 rounded-xl">
                      <span className="text-[10px] text-amber-500 font-bold block mb-1">Small-Cap</span>
                      <p className="text-slate-300 font-medium leading-relaxed">Rụt rè phòng thủ, lãi suất duy trì cao.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div
                style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }}
                className="rounded-2xl p-5 shadow-xl"
              >
                <h3 className="text-xs font-bold uppercase text-slate-300 mb-4 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-400" />
                  Ma Trận Thiên Nga Đen
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800/60 text-slate-400">
                        <th className="pb-3 font-semibold w-1/4">Sự Kiện</th>
                        <th className="pb-3 font-semibold w-1/2">Kênh Truyền Dẫn</th>
                        <th className="pb-3 font-semibold w-1/4">Tác Động</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                      {blackSwans.map((sw, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/20 transition">
                          <td className="py-3 pr-4 font-bold text-slate-200">{sw.event}</td>
                          <td className="py-3 pr-4 text-slate-300 font-medium leading-relaxed">{sw.channel}</td>
                          <td className="py-3 text-amber-400 font-bold">{sw.impact}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div
                style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }}
                className="rounded-2xl p-5 shadow-xl"
              >
                <h3 className="text-xs font-bold uppercase text-slate-300 mb-4 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-amber-500" />
                  Bản Đồ Xúc Tác Chính Sách Toàn Ngành
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800/60 text-slate-400">
                        <th className="pb-3 font-semibold">Tên Ngành</th>
                        <th className="pb-3 font-semibold">Xúc Tác</th>
                        <th className="pb-3 font-semibold">Trạng Thái</th>
                        <th className="pb-3 font-semibold">Dòng Tiền</th>
                        <th className="pb-3 font-semibold text-right">Sức Mạnh</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/30">
                      {sectorsData.map((sec, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/20 transition">
                          <td className="py-3 font-bold text-slate-200">{sec.name}</td>
                          <td className="py-3 text-slate-300 max-w-sm">{sec.catalyst}</td>
                          <td className="py-3">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                sec.status === "Strong Positive"
                                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                  : sec.status === "Positive"
                                  ? "bg-emerald-500/10 text-emerald-400/90"
                                  : "bg-slate-800 text-slate-400"
                              }`}
                            >
                              {sec.status}
                            </span>
                          </td>
                          <td className="py-3 text-slate-400 font-medium">{sec.flow}</td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="font-bold text-amber-400 font-mono">{sec.strength}%</span>
                              <div
                                style={{ background: "rgba(2,6,15,0.8)", border: "1px solid rgba(148,163,184,0.1)" }}
                                className="w-16 h-2 rounded-full overflow-hidden"
                              >
                                <div
                                  style={{ background: "linear-gradient(90deg, #fbbf24, #f59e0b)", width: `${sec.strength}%` }}
                                  className="h-full"
                                ></div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div
                style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }}
                className="rounded-2xl p-5 shadow-xl"
              >
                <h4 className="text-xs font-black text-slate-100 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-purple-300" />
                  Tầng 3: Sức Mạnh Xung Lực Ngành — Top 20
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800/60 text-slate-400 text-[10px] uppercase">
                        <th className="pb-2">Mã</th>
                        <th className="pb-2">Ngành</th>
                        <th className="pb-2 text-right">Sức Mạnh Ngành</th>
                        <th className="pb-2 text-right">Điểm Tầng 3</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/30">
                      {tang3.slice(0, 8).map((s, i) => (
                        <tr
                          key={i}
                          onClick={() => {
                            setSelectedStockId(s.ticker);
                            setActiveTab("elite");
                          }}
                          className="hover:bg-slate-800/20 transition cursor-pointer"
                        >
                          <td className="py-2 font-black text-amber-400">{s.ticker}</td>
                          <td className="py-2 text-slate-300">{s.sector}</td>
                          <td className="py-2 text-right text-purple-300 font-mono">{s.sectorStrength}%</td>
                          <td className="py-2 text-right text-amber-400 font-bold font-mono">{s.tang3Score.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-slate-500 mt-2">Hiển thị 8/20 mã. Xem đầy đủ tại tab Elite 10.</p>
              </div>
            </div>
          )}

          {activeTab === "ta" && (
            <div
              style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }}
              className="rounded-2xl p-6 shadow-xl space-y-6"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/60 pb-4">
                <div>
                  <h3 className="text-sm font-bold uppercase text-slate-100 flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    Trực Quan Hóa Đồ Thị & Phân Tích Hệ Thống Đa Chiều (T3)
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Đồ thị nến kỹ thuật truyền thống hoặc Bản đồ luân chuyển dòng tiền RRG.
                  </p>
                </div>
                <div style={{ background: "rgba(2,6,15,0.7)", border: "1px solid rgba(148,163,184,0.1)" }} className="flex flex-wrap gap-1 p-1 rounded-xl">
                  {["VCP", "Wyckoff", "Elliott", "VSA", "RRG"].map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setTaMode(mode)}
                      style={taMode === mode ? { background: "linear-gradient(135deg, #fbbf24, #f59e0b)" } : {}}
                      className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition ${
                        taMode === mode ? "text-slate-950" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {mode === "RRG" ? "Bản Đồ RRG (HOT!)" : `${mode} Mode`}
                    </button>
                  ))}
                </div>
              </div>

              {taMode === "RRG" ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div
                    style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }}
                    className="lg:col-span-2 rounded-2xl p-6 relative flex flex-col items-center"
                  >
                    <div className="absolute top-3 left-3 text-[10px] font-mono text-slate-500">
                      RRG: Relative Rotation Graph • Benchmark: <b className="text-amber-500">VN-Index</b>
                    </div>
                    <div className="w-full flex justify-between text-[11px] font-bold text-slate-400 px-2 mb-2">
                      <span className="text-sky-400">IMPROVING</span>
                      <span className="text-emerald-400">LEADING</span>
                    </div>
                    <div style={{ border: "1px solid rgba(148,163,184,0.12)" }} className="w-full max-w-[360px] h-[320px] relative rounded-2xl">
                      <svg width="100%" height="100%" viewBox="0 0 320 320" className="overflow-visible">
                        <line x1="160" y1="0" x2="160" y2="320" stroke="#1e293b" strokeWidth="1.5" strokeDasharray="3,3" />
                        <line x1="0" y1="160" x2="320" y2="160" stroke="#1e293b" strokeWidth="1.5" strokeDasharray="3,3" />
                        <circle cx="160" cy="160" r="140" fill="none" stroke="#172033" strokeWidth="1" />
                        <circle cx="160" cy="160" r="80" fill="none" stroke="#172033" strokeWidth="1" />
                        {rrgSectors.map((sector, sIdx) => {
                          const isSelected = selectedRrgSector === sector.name;
                          return (
                            <g key={sIdx} className="cursor-pointer" onClick={() => setSelectedRrgSector(sector.name)}>
                              <path
                                d={`M ${sector.prevX} ${sector.prevY} Q ${(sector.prevX + sector.x) / 2 - 10} ${
                                  (sector.prevY + sector.y) / 2 - 10
                                } ${sector.x} ${sector.y}`}
                                fill="none"
                                stroke={sector.color}
                                strokeWidth={isSelected ? "2.5" : "1.2"}
                                strokeDasharray={isSelected ? "none" : "2,2"}
                                opacity={isSelected ? "1" : "0.5"}
                              />
                              <circle cx={sector.x} cy={sector.y} r={isSelected ? "7" : "5"} fill={sector.color} stroke="#070b14" strokeWidth="1.5" />
                              <text
                                x={sector.x + 8}
                                y={sector.y + 4}
                                fill={isSelected ? "#ffffff" : "#94a3b8"}
                                fontSize={isSelected ? "11" : "9"}
                                className="font-bold select-none"
                              >
                                {sector.name}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                    <div className="w-full flex justify-between text-[11px] font-bold text-slate-400 px-2 mt-2">
                      <span className="text-red-400">LAGGING</span>
                      <span className="text-amber-500">WEAKENING</span>
                    </div>
                  </div>

                  <div
                    style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }}
                    className="rounded-2xl p-5 flex flex-col justify-between"
                  >
                    {(() => {
                      const sel = rrgSectors.find((s) => s.name === selectedRrgSector) || rrgSectors[0];
                      return (
                        <div>
                          <div className="flex items-center gap-2 mb-3 border-b border-slate-800/60 pb-3">
                            <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: sel.color }}></span>
                            <h4 className="font-black text-sm text-slate-100 uppercase">Ngành: {sel.name}</h4>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div style={{ background: "rgba(14,22,38,0.7)", border: "1px solid rgba(148,163,184,0.1)" }} className="p-3 rounded-lg">
                              <span className="text-slate-500 block uppercase text-[9px] font-bold">RS</span>
                              <span className="text-slate-200 font-mono font-bold block mt-0.5">{sel.rs}</span>
                            </div>
                            <div style={{ background: "rgba(14,22,38,0.7)", border: "1px solid rgba(148,163,184,0.1)" }} className="p-3 rounded-lg">
                              <span className="text-slate-500 block uppercase text-[9px] font-bold">Momentum</span>
                              <span className="text-slate-200 font-mono font-bold block mt-0.5">{sel.momentum}</span>
                            </div>
                          </div>
                          <div style={{ background: "rgba(14,22,38,0.7)", border: "1px solid rgba(148,163,184,0.1)" }} className="p-3.5 rounded-xl text-xs mt-3">
                            <span className="text-slate-400 block font-bold mb-1">Góc phần tư chu kỳ:</span>
                            <span
                              className={`font-black uppercase text-xs ${
                                sel.quadrant === "Leading"
                                  ? "text-emerald-400"
                                  : sel.quadrant === "Improving"
                                  ? "text-sky-400"
                                  : sel.quadrant === "Lagging"
                                  ? "text-red-400"
                                  : "text-amber-500"
                              }`}
                            >
                              {sel.quadrant}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 relative overflow-hidden">
                  <div className="absolute top-3 right-3 text-[10px] font-mono text-slate-500 space-y-0.5 text-right">
                    <div>
                      RSI (14): <b className="text-emerald-400">62.4</b>
                    </div>
                    <div>
                      MACD: <b className="text-emerald-400">12.5 (Bullish Cross)</b>
                    </div>
                    <div>
                      MFI: <b className="text-emerald-400">65.8</b>
                    </div>
                  </div>
                  <div className="h-64 flex items-end justify-between gap-1 border-b border-slate-800/60 pb-3">
                    {[
                      { h: 30, o: 35, c: 45, l: 28 },
                      { h: 48, o: 45, c: 50, l: 40 },
                      { h: 52, o: 50, c: 42, l: 40 },
                      { h: 46, o: 42, c: 38, l: 35 },
                      { h: 42, o: 38, c: 44, l: 34 },
                      { h: 58, o: 44, c: 54, l: 42 },
                      { h: 62, o: 54, c: 60, l: 52 },
                      { h: 68, o: 60, c: 56, l: 55 },
                      { h: 64, o: 56, c: 62, l: 54 },
                      { h: 74, o: 62, c: 72, l: 60 },
                    ].map((bar, i) => {
                      const isGreen = bar.c >= bar.o;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center h-full justify-end relative">
                          <div
                            className="w-[1.5px] bg-slate-600"
                            style={{ height: `${bar.h - bar.l}%`, transform: `translateY(${100 - bar.h}%)` }}
                          ></div>
                          <div
                            className={`w-full rounded-sm relative ${isGreen ? "bg-emerald-500/80" : "bg-red-500/80"}`}
                            style={{ height: `${Math.max(4, Math.abs(bar.c - bar.o))}%`, bottom: `${Math.min(bar.o, bar.c)}%` }}
                          ></div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
                    {taMode === "VCP" && (
                      <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }} className="text-amber-400 px-4 py-2 rounded-xl text-xs font-bold text-center">
                        MÔ HÌNH VCP ĐANG TẠO VÒNG THU HẸP THỨ 3
                        <span className="block text-[10px] font-medium text-slate-400 mt-1">Độ biến động giảm từ 15% ➔ 8% ➔ 3.5%</span>
                      </div>
                    )}
                    {taMode === "Wyckoff" && (
                      <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)" }} className="text-emerald-400 px-4 py-2 rounded-xl text-xs font-bold text-center">
                        WYCKOFF PHASE C: HOÀN THÀNH SPRING & SOS
                      </div>
                    )}
                    {taMode === "Elliott" && (
                      <div style={{ background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.3)" }} className="text-sky-400 px-4 py-2 rounded-xl text-xs font-bold text-center">
                        CHÂN SÓNG 3 TĂNG TRƯỞNG CHỦ ĐẠO
                      </div>
                    )}
                    {taMode === "VSA" && (
                      <div style={{ background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.3)" }} className="text-purple-300 px-4 py-2 rounded-xl text-xs font-bold text-center">
                        VSA: ĐANG QUÉT ĐIỂM NO-SUPPLY BAR
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 mt-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800/60 pb-4 mb-4">
                  <h4 className="text-sm font-black text-slate-100 uppercase tracking-wide flex items-center gap-2">
                    <Zap className="text-amber-500 animate-pulse w-5 h-5" />
                    Terminal Tín Hiệu Định Lượng (Tầng 4)
                  </h4>
                  <div style={{ background: "rgba(14,22,38,0.7)", border: "1px solid rgba(148,163,184,0.1)" }} className="flex p-1 rounded-xl text-[10px] font-bold">
                    {[
                      { id: "golden" as const, label: "Golden Filter" },
                      { id: "beartrap" as const, label: "Bẫy Giảm Giá" },
                      { id: "foreign" as const, label: "Quỹ Ngoại Gom" },
                    ].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setQuantRadarTab(t.id)}
                        style={quantRadarTab === t.id ? { background: "linear-gradient(135deg, #fbbf24, #f59e0b)" } : {}}
                        className={`px-3 py-1.5 rounded-lg transition ${
                          quantRadarTab === t.id ? "text-slate-950 font-black" : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {quantRadarTab === "golden" && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800/60 text-slate-400 text-[10px] uppercase">
                          <th className="pb-2">Mã</th>
                          <th className="pb-2">Điểm T4</th>
                          <th className="pb-2">Vị Thế</th>
                          <th className="pb-2 text-right">Mẫu Hình</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/30">
                        {tang4.slice(0, 6).map((item, idx) => (
                          <tr
                            key={idx}
                            onClick={() => {
                              setSelectedStockId(item.ticker);
                              setActiveTab("elite");
                            }}
                            className="hover:bg-slate-900/30 transition cursor-pointer"
                          >
                            <td className="py-2.5 font-black text-amber-400">{item.ticker}</td>
                            <td className="py-2.5 font-bold font-mono">{Math.round(item.tang4Score)}</td>
                            <td className="py-2.5 text-slate-300">
                              {item.taData?.leader ? "Mạnh hơn rõ rệt (Outperform)" : "Ổn định tích lũy"}
                            </td>
                            <td className="py-2.5 text-right font-bold text-slate-100">{item.taData?.pattern ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {quantRadarTab === "beartrap" && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800/60 text-slate-400 text-[10px] uppercase">
                          <th className="pb-2">Mã</th>
                          <th className="pb-2">Dòng Tiền Ngoại</th>
                          <th className="pb-2 text-right">Mẫu Hình</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/30">
                        {tang4
                          .filter((s) => s.taData && s.taData.foreignNet < 0)
                          .slice(0, 4)
                          .map((item, idx) => (
                            <tr
                              key={idx}
                              onClick={() => {
                                setSelectedStockId(item.ticker);
                                setActiveTab("elite");
                              }}
                              className="hover:bg-slate-900/30 transition cursor-pointer"
                            >
                              <td className="py-2.5 font-black text-amber-400">{item.ticker}</td>
                              <td className="py-2.5 text-red-400 font-mono">{item.taData?.foreignNet} tỷ</td>
                              <td className="py-2.5 text-right text-slate-300">{item.taData?.pattern}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {quantRadarTab === "foreign" && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800/60 text-slate-400 text-[10px] uppercase">
                          <th className="pb-2">Mã</th>
                          <th className="pb-2">Giá Trị Gom Ròng</th>
                          <th className="pb-2 text-right">Mẫu Hình</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/30">
                        {tang4
                          .filter((s) => s.taData && s.taData.foreignNet > 0)
                          .sort((a, b) => (b.taData?.foreignNet ?? 0) - (a.taData?.foreignNet ?? 0))
                          .slice(0, 4)
                          .map((item, idx) => (
                            <tr
                              key={idx}
                              onClick={() => {
                                setSelectedStockId(item.ticker);
                                setActiveTab("elite");
                              }}
                              className="hover:bg-slate-900/30 transition cursor-pointer"
                            >
                              <td className="py-2.5 font-black text-amber-400">{item.ticker}</td>
                              <td className="py-2.5 text-emerald-400 font-mono font-black">+{item.taData?.foreignNet} tỷ</td>
                              <td className="py-2.5 text-right text-slate-300">{item.taData?.pattern}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "elite" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500">
                  Tổng hợp 4 tầng — Cập nhật lần cuối: <b className="text-slate-400">{formatTimeAgo(lastUpdated.elite)}</b>
                </span>
                <button
                  onClick={() => {
                    handleUpdateTabData("elite");
                    handleUpdateTabData("scanner");
                    handleUpdateTabData("commodity");
                    handleUpdateTabData("sectors");
                    handleUpdateTabData("ta");
                  }}
                  disabled={updatingTab !== null}
                  style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)" }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-amber-400 hover:brightness-110 transition disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${updatingTab ? "animate-spin" : ""}`} />
                  {updatingTab ? "Đang tổng hợp 4 tầng..." : "Cập nhật & Tổng hợp 4 tầng"}
                </button>
              </div>

              {rebalanceLog.length > 0 && (
                <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)" }} className="rounded-2xl p-4 flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-300">
                    <b className="text-red-400">Dynamic Rebalancing kích hoạt:</b> mã <b className="text-red-400">{rebalanceLog[0].removed}</b>{" "}
                    vi phạm hỗ trợ MA50 đã bị tự động loại bỏ khỏi Elite 10. Mã dự phòng{" "}
                    <b className="text-emerald-400">{rebalanceLog[0].added}</b> được đẩy lên thay thế ngay lập tức ({rebalanceLog[0].time}).
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div
                  style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }}
                  className="rounded-2xl p-5 shadow-xl lg:col-span-2"
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                    <h3 className="text-sm font-bold uppercase text-slate-100 flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-amber-500 animate-pulse" />
                      Bảng Xếp Hạng Tinh Hoa: The Elite 10
                    </h3>
                    <div
                      style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}
                      className="text-[10px] text-amber-500 px-2 py-1 rounded-lg flex items-center gap-2"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      Khớp 4/4 tầng = Confluence Bonus tối đa
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800/60 text-slate-400">
                          <th className="pb-3 font-semibold">Ticker</th>
                          <th className="pb-3 font-semibold">Ngành</th>
                          <th className="pb-3 font-semibold">Bộ Lọc Khớp Lệnh</th>
                          <th className="pb-3 font-semibold text-center">Days in Elite</th>
                          <th className="pb-3 font-semibold text-center">MA50</th>
                          <th className="pb-3 font-semibold text-right font-mono">Điểm Hợp Lưu</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/30">
                        {eliteTop10.map((stk, idx) => {
                          const ma50 = stk.taData?.ma50Status ?? "safe";
                          return (
                            <tr
                              key={idx}
                              onClick={() => setSelectedStockId(stk.ticker)}
                              style={
                                selectedStockId === stk.ticker
                                  ? { background: "rgba(245,158,11,0.06)", borderLeft: "2px solid #f59e0b" }
                                  : {}
                              }
                              className="hover:bg-slate-800/30 transition cursor-pointer"
                            >
                              <td className="py-3 font-black text-sm pl-2">
                                <span className={stk.matchCount === 4 ? "text-amber-400" : "text-slate-300"}>{stk.ticker}</span>
                              </td>
                              <td className="py-3 text-slate-300 font-semibold">{stk.sector}</td>
                              <td className="py-3">
                                <FunnelBadge
                                  tang1Tickers={tang1Tickers}
                                  tang2Tickers={tang2Tickers}
                                  tang3Tickers={tang3Tickers}
                                  tang4Tickers={tang4Tickers}
                                  ticker={stk.ticker}
                                />
                              </td>
                              <td className="py-3 text-center text-slate-300 font-mono">{daysInEliteMap[stk.ticker] ?? 1}</td>
                              <td className="py-3 text-center">
                                {ma50 === "safe" && <ShieldCheck className="w-4 h-4 text-emerald-400 inline" />}
                                {ma50 === "warning" && <AlertTriangle className="w-4 h-4 text-amber-400 inline" />}
                                {ma50 === "broken" && <XCircle className="w-4 h-4 text-red-400 inline" />}
                              </td>
                              <td className="py-3 text-right">
                                <span
                                  className={`bg-slate-950/60 border px-2 py-0.5 rounded-full font-bold ${
                                    stk.matchCount === 4 ? "text-emerald-400 border-emerald-500/30" : "text-amber-400 border-amber-500/20"
                                  }`}
                                >
                                  {stk.finalScore} {stk.confluenceBonus > 0 ? `+${stk.confluenceBonus}★` : ""}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {reserve11 && (
                    <div style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.2)" }} className="mt-4 p-3 rounded-xl text-xs text-sky-300 flex items-center gap-2">
                      <Clock className="w-4 h-4 shrink-0" />
                      <span>
                        Mã dự phòng #11: <b className="text-sky-300">{reserve11.ticker}</b> ({reserve11.sector}) — điểm {reserve11.finalScore}, sẵn
                        sàng thay thế nếu Top 10 vi phạm MA50.
                      </span>
                    </div>
                  )}
                </div>

                <div
                  style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }}
                  className="rounded-2xl p-5 shadow-xl flex flex-col justify-between"
                >
                  {selectedStock && (
                    <>
                      <div>
                        <h3 className="text-xs font-bold uppercase text-slate-400 mb-2 tracking-wider">Phân Tích Hợp Lưu Đa Chiều</h3>
                        <div className="flex items-center justify-between border-b border-slate-800/60 pb-3 mb-4">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl font-black text-amber-400">{selectedStock.ticker}</span>
                            {(commodityFavoredTickers.has(selectedStock.ticker) || globalFavoredTickers.has(selectedStock.ticker)) && (
                              <span
                                style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)" }}
                                className="text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full"
                              >
                                ★ Đồng Pha Thế Giới
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-400">{selectedStock.sector}</span>
                        </div>
                        <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="p-4 rounded-xl">
                          {renderSpiderChart(selectedStock.radar)}
                        </div>
                      </div>
                      <div className="mt-5">
                        <h4 className="text-xs font-bold text-slate-300 mb-1">Luận Điểm Đầu Tư Từ CIO:</h4>
                        <p className="text-xs text-slate-400 leading-relaxed font-mono">{selectedStock.reason}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div
                  style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }}
                  className="rounded-2xl p-5 shadow-xl flex flex-col justify-between"
                >
                  <div>
                    <h3 className="text-xs font-bold uppercase text-amber-400 mb-3 flex items-center gap-1.5">
                      <Calculator className="w-4 h-4" />
                      Thông Số Bộ Quản Trị Vốn Kelly
                    </h3>
                    <p className="text-[11px] text-slate-400 leading-relaxed mb-4">
                      Tối ưu hóa quy mô đi tiền dựa trên công thức Kelly nhằm khống chế rủi ro tối đa.
                    </p>
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block uppercase mb-1">Tổng Vốn Hiện Tại (VND)</label>
                        <input
                          type="number"
                          value={totalCapital}
                          onChange={(e) => setTotalCapital(Number(e.target.value))}
                          style={{ background: "rgba(2,6,15,0.7)", border: "1px solid rgba(148,163,184,0.15)" }}
                          className="w-full rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block uppercase mb-1">Xác Suất Thắng Dự Kiến (%)</label>
                        <input
                          type="range"
                          min="30"
                          max="90"
                          value={expectedWinRate}
                          onChange={(e) => setExpectedWinRate(Number(e.target.value))}
                          className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                        <div className="flex justify-between font-mono text-[10px] text-slate-400 mt-1">
                          <span>30%</span>
                          <span className="text-amber-400 font-bold">{expectedWinRate}%</span>
                          <span>90%</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block uppercase mb-1">Hệ Số Quy Mô (Kelly Fraction)</label>
                        <div className="grid grid-cols-3 gap-1">
                          {[
                            { label: "1/4 Kelly", val: 0.25 },
                            { label: "1/2 Kelly", val: 0.5 },
                            { label: "Full Kelly", val: 1.0 },
                          ].map((frac) => (
                            <button
                              key={frac.label}
                              onClick={() => setKellyFraction(frac.val)}
                              style={
                                kellyFraction === frac.val
                                  ? { background: "rgba(245,158,11,0.14)", border: "1px solid rgba(245,158,11,0.5)" }
                                  : { background: "rgba(2,6,15,0.7)", border: "1px solid rgba(148,163,184,0.15)" }
                              }
                              className={`py-1 text-[10px] font-bold rounded-lg transition ${
                                kellyFraction === frac.val ? "text-amber-400" : "text-slate-400"
                              }`}
                            >
                              {frac.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }}
                  className="lg:col-span-2 rounded-2xl p-5 shadow-xl grid grid-cols-1 md:grid-cols-3 gap-5"
                >
                  <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="p-4 rounded-xl flex flex-col justify-between">
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Tỷ Lệ Đi Tiền Khuyên Dùng</span>
                      <span className="text-2xl font-black text-amber-400 mt-2 block font-mono">{kellyCalculation.allocatedPercentage}%</span>
                    </div>
                    <span className="text-[9px] text-slate-400 leading-normal block">
                      Kelly tối đa lý thuyết: <b className="text-slate-300 font-mono">{kellyCalculation.rawKelly}%</b> (R/R ={" "}
                      {kellyCalculation.rrRatio}).
                    </span>
                  </div>
                  <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="p-4 rounded-xl flex flex-col justify-between">
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Ngân Sách Giải Ngân</span>
                      <span className="text-lg font-black text-emerald-400 mt-2 block font-mono">
                        {kellyCalculation.allocatedCapital.toLocaleString()} VND
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-200 block font-bold">Mua Gom: {kellyCalculation.shares.toLocaleString()} CP</span>
                  </div>
                  <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="p-4 rounded-xl flex flex-col justify-between">
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Rủi Ro Tối Đa Trên Deal</span>
                      <span className="text-lg font-black text-red-400 mt-2 block font-mono">
                        {kellyCalculation.maxRiskCapital.toLocaleString()} VND
                      </span>
                    </div>
                    <span className="text-[9px] text-slate-400 leading-normal block">
                      Khi giá chạm Stoploss: <b className="text-slate-200 font-mono">{selectedStock?.stoploss}đ</b>.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      <footer
        style={{ background: "linear-gradient(180deg, #0a0f1e 0%, #070b14 100%)", borderTop: "1px solid rgba(148,163,184,0.08)" }}
        className="py-6 px-6 text-center text-xs text-slate-500 mt-auto"
      >
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p>© 2026 GLOBAL QUANT-MACRO & MARKET SCANNER. Phát triển chuyên sâu dựa trên triết lý đầu tư Momentum Trading.</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-slate-300">Điều khoản sử dụng</a>
            <a href="#" className="hover:text-slate-300">Bảo mật dữ liệu</a>
            <a href="#" className="hover:text-slate-300">Tuyên bố miễn trừ trách nhiệm</a>
          </div>
        </div>
      </footer>

      {/* ============ FLOATING CHAT AI ============ */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)", boxShadow: "0 8px 24px rgba(245,158,11,0.4)" }}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center hover:brightness-110 transition active:scale-95"
        >
          <MessageCircle className="w-6 h-6 text-slate-950" />
        </button>
      )}

      {chatOpen && (
        <div
          style={{
            background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)",
            border: "1px solid rgba(245,158,11,0.25)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          }}
          className="fixed bottom-6 right-6 z-50 w-[360px] h-[480px] rounded-2xl flex flex-col overflow-hidden"
        >
          <div style={{ borderBottom: "1px solid rgba(148,163,184,0.1)" }} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-black text-slate-100">Trợ Lý CIO AI</span>
            </div>
            <button onClick={() => setChatOpen(false)} className="text-slate-400 hover:text-slate-200">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  style={
                    msg.role === "user"
                      ? { background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }
                      : { background: "rgba(2,6,15,0.7)", border: "1px solid rgba(148,163,184,0.1)" }
                  }
                  className={`max-w-[85%] px-3 py-2 rounded-xl text-[11px] leading-relaxed whitespace-pre-line ${
                    msg.role === "user" ? "text-slate-950 font-semibold" : "text-slate-200"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div
                  style={{ background: "rgba(2,6,15,0.7)", border: "1px solid rgba(148,163,184,0.1)" }}
                  className="px-3 py-2 rounded-xl text-[11px] text-slate-400 flex items-center gap-2"
                >
                  <RefreshCw className="w-3 h-3 animate-spin" /> Đang suy nghĩ...
                </div>
              </div>
            )}
          </div>

          <div style={{ borderTop: "1px solid rgba(148,163,184,0.1)" }} className="p-3 flex items-center gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSendChat();
              }}
              placeholder="Hỏi về thị trường, mã CP, chiến lược..."
              style={{ background: "rgba(2,6,15,0.7)", border: "1px solid rgba(148,163,184,0.15)" }}
              className="flex-1 rounded-lg px-3 py-2 text-[11px] text-slate-200 focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={handleSendChat}
              disabled={chatLoading || !chatInput.trim()}
              style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}
              className="p-2 rounded-lg text-slate-950 disabled:opacity-40 hover:brightness-110 transition"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}