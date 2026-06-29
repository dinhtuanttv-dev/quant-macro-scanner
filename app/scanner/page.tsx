"use client";

import { useState, useMemo, useEffect } from "react";
import { Cpu, Sparkles, SlidersHorizontal, Filter, Layers, Globe, Activity, TrendingUp, Award, RefreshCw } from "lucide-react";

import TickerMarquee from "@/components/quant/TickerMarquee";
import MarketStructureBar from "@/components/quant/MarketStructureBar";
import RealMarketDataPanel from "@/components/quant/RealMarketDataPanel";
import ChatPanel from "@/components/quant/ChatPanel";
import ScannerTab from "@/components/quant/ScannerTab";
import CommodityTab from "@/components/quant/CommodityTab";
import SectorsTab from "@/components/quant/SectorsTab";
import TaTab from "@/components/quant/TaTab";
import EliteTab from "@/components/quant/EliteTab";

import {
  stockUniverse, globalIndicesSectors, commoditiesImpact, sectorsData,
  blackSwans, rrgSectors, eliteDetailMap,
} from "@/lib/quant-data";
import {
  computeTang1, computeTang2, computeTang3, computeTang4, computeConfluence,
} from "@/lib/quant-funnel";
import { overrideTang4WithRealData } from "@/lib/quant-funnel-override";
import { useMarketData } from "@/lib/market-data/useMarketData";

const liveMacroNewsSentiment = [
  { id: 1, headline: "Ngan hang Nha nuoc giam lai suat lien ngan hang them 0.25%", impact: 8, affectedSectors: "Tat ca cac nganh", relatedTicker: "TCB", type: "Chinh sach SBV" },
  { id: 2, headline: "Thong qua gia han hieu luc Luat Dat dai 2024 som tu thang sau", impact: 7, affectedSectors: "Bat dong san", relatedTicker: "NLG", type: "Chinh sach dat dai" },
  { id: 3, headline: "Cuoc tau Drewry tiep tuc phi ma vuot moc 5,200 USD/FEU", impact: 9, affectedSectors: "Van tai bien", relatedTicker: "HAH", type: "Hang hoa & Van tai" },
  { id: 4, headline: "Gia Phot pho vang toan cau but toc 4.5% nho nhu cau ban dan", impact: 8, affectedSectors: "Hoa chat ban dan", relatedTicker: "DGC", type: "Hang hoa the gioi" },
  { id: 5, headline: "Ty gia USD/VND chiu suc ep lon khi DXY tang vot len vung 105.8", impact: -6, affectedSectors: "BDS & Tai chinh", relatedTicker: "VIC", type: "Ty gia & Lien thi truong" },
];

export default function ScannerPage() {
  const [activeTab, setActiveTab] = useState("scanner");
  const [scannerProgress, setScannerProgress] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState("");

  const [marketBias, setMarketBias] = useState("Bullish");
  const [focusSector, setFocusSector] = useState("All");

  const [aiReport, setAiReport] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  const [selectedStockId, setSelectedStockId] = useState("FPT");
  const [taMode, setTaMode] = useState("VCP");
  const [quantRadarTab, setQuantRadarTab] = useState("golden");
  const [selectedRrgSector, setSelectedRrgSector] = useState("Cong nghe");

  const [totalCapital, setTotalCapital] = useState(1000000000);
  const [expectedWinRate, setExpectedWinRate] = useState(55);
  const [kellyFraction, setKellyFraction] = useState(0.5);

  const [activeNewsId, setActiveNewsId] = useState(1);

  const [universe] = useState(stockUniverse);
  const [daysInEliteMap] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    ["FPT", "PVS", "TCB", "HAH", "DGC", "GVR", "MWG", "STB", "NLG", "HPG"].forEach((tk, idx) => {
      init[tk] = 45 - idx * 3;
    });
    return init;
  });
  const [rebalanceLog, setRebalanceLog] = useState<{ time: string; removed: string; added: string; reason: string }[]>([]);

  const tang1Result = useMemo(() => computeTang1(universe), [universe]);
  const tang2Result = useMemo(() => computeTang2(tang1Result, universe), [tang1Result, universe]);
  const tang3Result = useMemo(() => computeTang3(tang2Result), [tang2Result]);

  const tang4ResultBase = useMemo(() => computeTang4(tang3Result), [tang3Result]);
  const { marketData } = useMarketData(10);
  const tang4Result = useMemo(
    () => overrideTang4WithRealData(tang4ResultBase, marketData),
    [tang4ResultBase, marketData]
  );

  const confluenceResult = useMemo(
    () => computeConfluence(tang1Result, tang2Result, tang3Result, tang4Result, universe),
    [tang1Result, tang2Result, tang3Result, tang4Result, universe]
  );

  const eliteTop10 = useMemo(() => confluenceResult.slice(0, 10), [confluenceResult]);
  const reserve11 = useMemo(() => confluenceResult[10] || null, [confluenceResult]);

  useEffect(() => {
    const broken = eliteTop10.find((s) => s.taData?.ma50Status === "broken");
    if (broken && reserve11) {
      setRebalanceLog((prev) => {
        const alreadyLogged = prev.some((l) => l.removed === broken.ticker && l.added === reserve11.ticker);
        if (alreadyLogged) return prev;
        return [
          { time: new Date().toLocaleTimeString(), removed: broken.ticker, added: reserve11.ticker, reason: "Vi pham ho tro ky thuat MA50" },
          ...prev,
        ].slice(0, 5);
      });
    }
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

  const selectedStock = useMemo(() => {
    const conf = confluenceResult.find((s) => s.ticker === selectedStockId);
    const detail = eliteDetailMap[selectedStockId];
    if (!conf && !detail) return null;
    return {
      ticker: selectedStockId,
      sector: conf?.sector || universe.find((u) => u.ticker === selectedStockId)?.sector || "-",
      score: conf?.finalScore ?? 0,
      matchCount: conf?.matchCount ?? 0,
      entry: detail ? detail.entry.toLocaleString() : "-",
      target: detail ? detail.target.toLocaleString() : "-",
      stoploss: detail ? detail.stoploss.toLocaleString() : "-",
      weight: detail?.weight ?? "-",
      radar: detail?.radar ?? { macro: 70, flow: 70, tech: 70, sentiment: 70 },
      reason: detail?.reason ?? "Co phieu dang trong danh sach theo doi mo rong.",
      pattern: conf?.taData?.pattern ?? "-",
      rr: detail ? (((detail.target - detail.entry) / (detail.entry - detail.stoploss)).toFixed(2)) : "-",
    };
  }, [selectedStockId, confluenceResult, universe]);

  const aiValuationMatrix = useMemo(() => {
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
        status: marginOfSafety > 15 ? "Sieu Hap Dan" : marginOfSafety > 5 ? "Hop Ly" : "Can Cho Dieu Chinh",
      };
    });
  }, [marketBias, eliteTop10]);

  const activeNewsDetails = liveMacroNewsSentiment.find((n) => n.id === activeNewsId) || liveMacroNewsSentiment[0];

  const actionableSignals = eliteTop10.slice(0, 4).map((s) => ({
    ticker: s.ticker,
    action: s.taData?.breakout ? "MUA TICH LUY" : "QUAN SAT TAO DAY",
    confidence: `${Math.min(96, Math.round(60 + s.finalScore / 3))}%`,
    zone: eliteDetailMap[s.ticker] ? `${Math.round(eliteDetailMap[s.ticker].entry * 0.98).toLocaleString()} - ${eliteDetailMap[s.ticker].entry.toLocaleString()}` : "-",
    status: s.taData?.breakout ? "Kich hoat" : "Doi xac nhan",
  }));

  const kellyCalculation = useMemo(() => {
    if (!selectedStock || selectedStock.entry === "-") {
      return { rrRatio: "0", rawKelly: "0", allocatedPercentage: "0", allocatedCapital: 0, shares: 0, maxRiskCapital: 0 };
    }
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

  const getMockCioReport = (bias: string, sector: string) => {
    const top4 = eliteTop10.slice(0, 4);
    const lines = top4
      .map((s, i) => {
        const d = eliteDetailMap[s.ticker];
        if (!d) return "";
        return `${i + 1}. ${s.ticker} (${s.sector} - Ty trong ${d.weight}): Khop ${s.matchCount}/4 tang loc, diem hop luu ${s.finalScore}
   Diem mua: ${Math.round(d.entry * 0.98).toLocaleString()} - ${d.entry.toLocaleString()} | Chot loi: ${d.target.toLocaleString()} | Dung lo: ${d.stoploss.toLocaleString()}`;
      })
      .join("\n");

    return `[BAO CAO CIO CHIEN LUOC]
Trang thai: ${bias} Bias | Nganh tieu diem: ${sector}
Thoi gian: ${new Date().toLocaleString()}

=== PHEU LOC 4 TANG ===
Tang 1: ${tang1Result.length} ma giu lai tu vu tru 60 ma.
Tang 2: ${tang2Result.length} ma dong pha voi chi so the gioi va hang hoa.
Tang 3: ${tang3Result.length} ma thuoc nhom nganh co xung luc manh nhat.
Tang 4: ${tang4Result.length} ma hoi tu ky thuat va dong tien ngoai.

=== ELITE 10 ===
${eliteTop10.map((s) => `- ${s.ticker}: khop ${s.matchCount}/4 tang, diem ${s.finalScore}`).join("\n")}

${reserve11 ? `Ma du phong #11: ${reserve11.ticker} (diem ${reserve11.finalScore})` : ""}

=== TOP 4 KHUYEN NGHI ===
${lines}`;
  };

  const handleRunLiveScanner = async () => {
    setIsScanning(true);
    setScannerProgress(5);
    setScanStep("Mo giao thuc Real-Time: Quet vu tru 60 ma, chi so the gioi, hang hoa, tin tuc vi mo...");
    const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

    await delay(500);
    setScannerProgress(25);
    setScanStep("TANG 1: Loc theo FA va EPS Growth - giu lai 20 ma...");
    await delay(500);
    setScannerProgress(45);
    setScanStep("TANG 2: Quet dong thuan nganh the gioi & hang hoa toan cau...");
    await delay(500);
    setScannerProgress(65);
    setScanStep("TANG 3: Loc theo suc manh xung luc nhom nganh Viet Nam...");
    await delay(500);
    setScannerProgress(85);
    setScanStep("TANG 4: Phan tich ky thuat hoi tu dong tien lon + dong tien khoi ngoai...");
    await delay(500);
    setScannerProgress(95);
    setScanStep("Tinh Trong so Dong thuan & kiem tra Dynamic Rebalancing MA50...");

    setIsAiLoading(true);
    await delay(700);
    setAiReport(getMockCioReport(marketBias, focusSector));
    setAiError("");
    setIsScanning(false);
    setIsAiLoading(false);
    setScannerProgress(100);
  };

  const contextSummary = `Tab dang xem = ${activeTab}. Elite 10: ${eliteTop10.map((s) => s.ticker).join(", ")}. Ma dang chon: ${selectedStockId}. Xu huong: ${marketBias}.`;

  return (
    <div style={{ background: "#070b14" }} className="min-h-screen text-slate-100 font-sans flex flex-col antialiased relative">
      <TickerMarquee />

      <header style={{ background: "linear-gradient(180deg, #0d1424 0%, #0a0f1e 100%)", borderBottom: "1px solid rgba(245,158,11,0.12)" }} className="px-6 py-4 sticky top-[33px] z-40 shadow-2xl">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div style={{ background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #10b981 100%)" }} className="p-2.5 rounded-xl">
              <Cpu className="w-7 h-7 text-slate-950" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-wide text-slate-50 flex items-center gap-2">
                GLOBAL QUANT-MACRO & MARKET SCANNER
                <span style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)" }} className="text-[10px] text-amber-400 px-2.5 py-0.5 rounded-full font-bold">CIO ENGINE</span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">Chuyen gia phan tich lien thi truong & Momentum Trading</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl w-full mx-auto px-4 md:px-6 pt-6 space-y-6">
        <MarketStructureBar />
        <RealMarketDataPanel limit={10} />
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        <section className="lg:col-span-1 flex flex-col gap-6">
          <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 shadow-xl">
            <h2 className="text-sm font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2 mb-4">
              <SlidersHorizontal className="w-4 h-4 text-amber-500" />
              Cau Hinh Thong So CIO
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Xu Huong Thi Truong</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setMarketBias("Bullish")} style={marketBias === "Bullish" ? { background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.5)" } : { border: "1px solid rgba(148,163,184,0.15)" }} className={`px-3 py-2 text-xs font-bold rounded-lg transition ${marketBias === "Bullish" ? "text-emerald-400" : "bg-slate-950/60 text-slate-400"}`}>Tang truong</button>
                  <button onClick={() => setMarketBias("Bearish")} style={marketBias === "Bearish" ? { background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.5)" } : { border: "1px solid rgba(148,163,184,0.15)" }} className={`px-3 py-2 text-xs font-bold rounded-lg transition ${marketBias === "Bearish" ? "text-red-400" : "bg-slate-950/60 text-slate-400"}`}>Phong thu</button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Nganh Tieu Diem</label>
                <select value={focusSector} onChange={(e) => setFocusSector(e.target.value)} style={{ border: "1px solid rgba(148,163,184,0.15)" }} className="w-full bg-slate-950/60 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500">
                  <option value="All">--- Tat ca cac nganh ---</option>
                  <option value="Cong nghe">Cong nghe & AI</option>
                  <option value="Dau khi">Dau khi</option>
                  <option value="Ngan hang">Ngan hang</option>
                  <option value="Van tai bien">Van tai bien</option>
                  <option value="Cao su">Cao su & KCN</option>
                  <option value="Bat dong san">Bat dong san</option>
                </select>
              </div>
              <button onClick={handleRunLiveScanner} disabled={isScanning} style={{ background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)" }} className="w-full text-slate-950 font-black py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition duration-200 text-xs disabled:opacity-50">
                <Sparkles className="w-4 h-4 text-slate-950" />
                {isScanning ? "DANG QUET PHEU LOC..." : "KICH HOAT SIEU CAU LENH"}
              </button>
            </div>
          </div>

          <div style={{ background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-2xl p-5 shadow-xl flex-1 flex flex-col">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between mb-4">
              <span className="flex items-center gap-2"><Filter className="w-4 h-4 text-amber-400" />Pheu Loc 4 Tang</span>
              <span style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)" }} className="text-[10px] text-emerald-400 px-2 py-0.5 rounded-full font-bold">60 to 10</span>
            </h2>
            <div className="space-y-2.5 flex-1">
              {[
                { label: "Vu tru goc", count: universe.length, icon: Layers, color: "#64748b" },
                { label: "Tang 1: Sieu quet AI", count: tang1Result.length, icon: Cpu, color: "#f59e0b" },
                { label: "Tang 2: Ket noi the gioi", count: tang2Result.length, icon: Globe, color: "#38bdf8" },
                { label: "Tang 3: Suc manh nganh", count: tang3Result.length, icon: Activity, color: "#a78bfa" },
                { label: "Tang 4: TA + Dong tien ngoai", count: tang4Result.length, icon: TrendingUp, color: "#34d399" },
                { label: "Elite 10", count: eliteTop10.length, icon: Award, color: "#fbbf24" },
              ].map((row, i) => {
                const Icon = row.icon;
                return (
                  <div key={i} style={{ background: "rgba(2,6,15,0.5)", border: "1px solid rgba(148,163,184,0.08)" }} className="flex items-center justify-between p-2.5 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5" style={{ color: row.color }} />
                      <span className="text-[11px] text-slate-300 font-semibold">{row.label}</span>
                    </div>
                    <span className="text-xs font-black font-mono" style={{ color: row.color }}>{row.count}</span>
                  </div>
                );
              })}
            </div>
            {rebalanceLog.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-800/60">
                <h3 className="text-[10px] font-bold uppercase text-red-400 mb-2 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Tai Co Cau Gan Nhat</h3>
                <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }} className="p-2.5 rounded-lg text-[10px] text-slate-300">
                  <span className="text-red-400 font-bold">{rebalanceLog[0].removed}</span> bi loai -&gt; <span className="text-emerald-400 font-bold">{rebalanceLog[0].added}</span> thay the.
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="lg:col-span-3 flex flex-col gap-6">
          <div style={{ background: "rgba(14,22,38,0.7)", border: "1px solid rgba(148,163,184,0.1)" }} className="flex p-1 rounded-2xl flex-wrap">
            {[
              { id: "scanner", label: "Sieu quet AI", icon: Cpu },
              { id: "commodity", label: "Ket noi the gioi", icon: Globe },
              { id: "sectors", label: "Loc Nganh", icon: Layers },
              { id: "ta", label: "TA VN-Index", icon: Activity },
              { id: "elite", label: "Elite 10", icon: Award },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={isActive ? { background: "linear-gradient(135deg, rgba(245,158,11,0.16), rgba(16,185,129,0.08))" } : {}} className={`flex-1 min-w-[120px] py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${isActive ? "text-amber-400" : "text-slate-400 hover:text-slate-200"}`}>
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {activeTab === "scanner" && (
            <ScannerTab
              isScanning={isScanning} scannerProgress={scannerProgress} scanStep={scanStep}
              aiReport={aiReport} isAiLoading={isAiLoading} aiError={aiError}
              actionableSignals={actionableSignals} liveMacroNewsSentiment={liveMacroNewsSentiment}
              activeNewsId={activeNewsId} setActiveNewsId={setActiveNewsId} activeNewsDetails={activeNewsDetails}
              aiValuationMatrix={aiValuationMatrix} setSelectedStockId={setSelectedStockId} setActiveTab={setActiveTab}
              tang1Result={tang1Result}
            />
          )}
          {activeTab === "commodity" && (
            <CommodityTab globalIndicesSectors={globalIndicesSectors} commoditiesImpact={commoditiesImpact} tang2Result={tang2Result} setSelectedStockId={setSelectedStockId} setActiveTab={setActiveTab} />
          )}
          {activeTab === "sectors" && (
            <SectorsTab sectorsData={sectorsData} blackSwans={blackSwans} tang3Result={tang3Result} setSelectedStockId={setSelectedStockId} setActiveTab={setActiveTab} />
          )}
          {activeTab === "ta" && (
            <TaTab taMode={taMode} setTaMode={setTaMode} rrgSectors={rrgSectors} selectedRrgSector={selectedRrgSector} setSelectedRrgSector={setSelectedRrgSector} quantRadarTab={quantRadarTab} setQuantRadarTab={setQuantRadarTab} tang4Result={tang4Result} setSelectedStockId={setSelectedStockId} setActiveTab={setActiveTab} />
          )}
          {activeTab === "elite" && (
            <EliteTab
              eliteTop10={eliteTop10} reserve11={reserve11} selectedStockId={selectedStockId} setSelectedStockId={setSelectedStockId} selectedStock={selectedStock}
              commodityFavoredTickers={commodityFavoredTickers} globalFavoredTickers={globalFavoredTickers}
              daysInEliteMap={daysInEliteMap} rebalanceLog={rebalanceLog}
              totalCapital={totalCapital} setTotalCapital={setTotalCapital}
              expectedWinRate={expectedWinRate} setExpectedWinRate={setExpectedWinRate}
              kellyFraction={kellyFraction} setKellyFraction={setKellyFraction}
              kellyCalculation={kellyCalculation}
              tang1Result={tang1Result} tang2Result={tang2Result} tang3Result={tang3Result} tang4Result={tang4Result}
            />
          )}
        </section>
      </main>

      <ChatPanel contextSummary={contextSummary} />
    </div>
  );
}