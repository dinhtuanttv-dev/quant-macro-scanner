import { NextRequest, NextResponse } from "next/server";
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";
import { runHamiltonFilter } from "@/lib/elite10/ms-garch-hamilton-filter";
import { estimateMsGarchParams } from "@/lib/elite10/ms-garch-estimator";
import { runMonteCarloSimulation } from "@/lib/elite10/ms-garch-monte-carlo";

// Elite 10 - Muc F (Tech Spec v2) Giai doan 4/5: ket noi 3 module da co
// (Hamilton Filter, Estimator, Monte Carlo) thanh 1 route hoan chinh
// chay tren du lieu gia THAT. On-demand (nguoi dung bam nut, giong
// Debate AI) vi ước luong tham so (Nelder-Mead) ton tai nguyen tinh
// toan dang ke - KHONG tu dong chay cho toan bo thi truong.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HORIZON_DAYS = 20;
const N_SIMULATIONS = 3000;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  try {
    const { ticker: tickerParam } = await params;
    const ticker = tickerParam.toUpperCase();

    const result = await fetchOhlcvHistory(ticker, "2y");
    if (!result.success || !result.data || result.data.length < 100) {
      return NextResponse.json({ error: "Không đủ dữ liệu giá thật để chạy MS-GARCH (cần tối thiểu 100 phiên)." }, { status: 422 });
    }
    const bars = result.data;

    // Log-return theo % (dung don vi giong da thiet ke trong module
    // Monte Carlo: ret=0.05 nghia la 0.05%, khong phai 5%).
    const returns: number[] = [];
    for (let i = 1; i < bars.length; i++) {
      returns.push(Math.log(bars[i].adjClose / bars[i - 1].adjClose) * 100);
    }

    const estimation = estimateMsGarchParams(returns);
    if (!estimation) {
      return NextResponse.json({ error: "Không đủ dữ liệu để ước lượng tham số MS-GARCH." }, { status: 422 });
    }

    // Chay lai Hamilton Filter voi tham so DA UOC LUONG, de lay trang
    // thai regime TAI THOI DIEM CUOI CUNG (dung cho Monte Carlo).
    const filterResult = runHamiltonFilter(returns, estimation.params);
    const lastIdx = filterResult.filteredProbs.length - 1;
    const lastFilteredProbs = filterResult.filteredProbs[lastIdx];
    const lastRegimeVariances = filterResult.regimeVariances[lastIdx];
    const lastReturn = returns[returns.length - 1];
    const lastEpsSq = (lastReturn - estimation.params.mu) ** 2;
    const currentPrice = bars[bars.length - 1].adjClose;

    const mc = runMonteCarloSimulation({
      params: estimation.params,
      lastFilteredProbs, lastRegimeVariances, lastEpsSq,
      currentPrice, horizonDays: HORIZON_DAYS, nSimulations: N_SIMULATIONS,
    });

    // Xac dinh regime "hien tai" (nhan dien don gian: xac suat cao hon
    // + ten goi theo omega thap/cao hon, khong gia dinh regime nao
    // "tot/xau" - chi la "yen tinh"/"bien dong" ve mat thong ke).
    const isRegime1Calmer = estimation.params.regimes[0].omega < estimation.params.regimes[1].omega;
    const calmIdx = isRegime1Calmer ? 0 : 1;
    const volatileIdx = isRegime1Calmer ? 1 : 0;
    const currentRegimeLabel = lastFilteredProbs[calmIdx] > lastFilteredProbs[volatileIdx] ? "calm" : "volatile";

    return NextResponse.json({
      ticker, currentPrice,
      horizonDays: HORIZON_DAYS, nSimulations: N_SIMULATIONS,
      isConverged: estimation.isConverged, warnings: estimation.warnings,
      currentRegime: {
        label: currentRegimeLabel,
        probCalm: lastFilteredProbs[calmIdx], probVolatile: lastFilteredProbs[volatileIdx],
      },
      regimeParams: {
        calm: estimation.params.regimes[calmIdx], volatile: estimation.params.regimes[volatileIdx],
      },
      fanChart: mc.fanChart,
      dataSource: "Yahoo Finance adjClose (2 năm gần nhất), log-return %",
      methodologyNote: "Markov-Switching GARCH (Gray 1996, path-independent specification) — 2 chế độ biến động (yên tĩnh/mạnh), ước lượng bằng Maximum Likelihood + Nelder-Mead (Hamilton Filter tính log-likelihood). Đây là bước ước lượng thống kê không có công thức đóng — luôn kiểm tra 'isConverged' và 'warnings' trước khi tin vào kết quả, đặc biệt khi mẫu dữ liệu ngắn. Fan chart (dải phân vị 10/50/90) từ mô phỏng Monte Carlo, không phải dự báo chắc chắn — phản ánh phân phối xác suất dựa trên mô hình đã ước lượng. QUAN TRỌNG: mô hình chỉ ước lượng ĐỘ BIẾN ĐỘNG (variance) thay đổi theo thời gian — phần xu hướng trung tâm (medianReturn, đường p50) dùng drift trung bình (mu) không đổi, ước lượng từ lịch sử. Đây KHÔNG PHẢI dự báo xu hướng giá tương lai (mô hình không 'biết' giá sẽ tăng hay giảm) — nếu p50 lệch khỏi giá hiện tại, đó phản ánh drift lịch sử trung bình của mã, không phải khuyến nghị hay tín hiệu mua/bán.",
    });
  } catch (err) {
    console.error("[api/elite10/ms-garch] Lỗi:", err);
    return NextResponse.json({ error: "Không thể chạy MS-GARCH lúc này." }, { status: 500 });
  }
}
