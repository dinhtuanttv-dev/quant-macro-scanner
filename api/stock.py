"""
api/stock.py — Vercel Python Serverless Function (FastAPI/ASGI).

Vercel tự nhận diện đối tượng `app` (FastAPI instance) trong file này và
expose thành endpoint tại /api/stock — không cần cấu hình routes thủ công
trong vercel.json (theo tài liệu chính thức Vercel Python Runtime).

QUAN TRỌNG — về tên hàm vnstock:
Yêu cầu ban đầu nhắc tới `stock_historical_data` — đây là hàm của vnstock
bản CŨ (trước v4). Từ v4 (Unified UI), cách gọi đúng và được vnstocks.com
tài liệu hóa chính thức là `Market().equity(ticker).ohlcv(...)`. Dùng
`stock_historical_data` có rủi ro không còn hoạt động hoặc bị deprecate.
Code dưới đây có thêm lớp fallback sang cách gọi namespace-style
(`market.equity.ohlcv(symbol=...)`) phòng trường hợp phiên bản cài đặt
thực tế trên Vercel khác với bản mình đã tra cứu.
"""

from datetime import date, timedelta
from typing import Optional

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# CORS: vì đây là cá nhân/nghiên cứu, để "*" cho đơn giản. Nếu sau này
# public hoặc thương mại hóa, PHẢI siết lại đúng domain thật.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# Map timeframe của Project A (D/W/M) sang interval của vnstock.
INTERVAL_MAP = {"D": "1D", "W": "1W", "M": "1M"}
DEFAULT_LOOKBACK_DAYS = {"1D": 800, "1W": 365 * 5, "1M": 365 * 8}


def fetch_ohlcv(symbol: str, start: str, end: str, interval: str) -> pd.DataFrame:
    """Gọi vnstock với 2 kiểu cú pháp khác nhau — thử kiểu chính trước
    (đã xác nhận đúng qua tài liệu vnstocks.com), fallback sang kiểu cũ
    nếu bản cài đặt thực tế khác (đề phòng thư viện đổi API).

    QUAN TRỌNG: tham số `count` BẮT BUỘC phải truyền tường minh và đủ lớn.
    Đã xác nhận qua test thực tế: nếu không truyền `count`, vnstock âm thầm
    giới hạn về 100 nến gần nhất, BỎ QUA hoàn toàn `start` được truyền vào
    (ví dụ yêu cầu start=2025-01-01 nhưng thực nhận về chỉ từ 2026-04-14).
    Khi truyền count đủ lớn (vd 2000), start/end mới được tôn trọng đúng.
    """
    from vnstock import Market

    # Đủ lớn để không bao giờ bị cắt bớt so với khoảng start/end yêu cầu,
    # nhưng vẫn có giới hạn trên hợp lý để tránh 1 request quá nặng.
    count_by_interval = {"1D": 2000, "1W": 500, "1M": 200}
    count = count_by_interval.get(interval, 2000)

    market = Market()
    try:
        # Kiểu 1 (ưu tiên): equity(ticker) trả về object, gọi .ohlcv() trên đó.
        df = market.equity(symbol).ohlcv(start=start, end=end, interval=interval, count=count)
    except (TypeError, AttributeError):
        # Kiểu 2 (fallback): equity là namespace, gọi thẳng .ohlcv(symbol=...).
        # Lưu ý: kiểu này có thể KHÔNG hỗ trợ tham số interval/count — nếu vào
        # nhánh này, dữ liệu trả về mặc định là daily bất kể timeframe yêu cầu,
        # và có thể vẫn bị giới hạn 100 nến (chưa kiểm chứng được ở nhánh dự phòng này).
        df = market.equity.ohlcv(symbol=symbol, start=start, end=end)
    return df


def safe_float(v):
    """Chuyển mọi dạng giá trị 'thiếu' của pandas (NaN, pd.NA, NaT, None)
    về None. Dùng pd.isna() thay vì chỉ check math.isnan() vì cột RSI có
    thể sinh ra pd.NA (không phải float('nan') chuẩn) khi avg_loss=0 bị
    thay bằng pd.NA trong compute_indicators() — math.isnan() KHÔNG bắt
    được pd.NA, sẽ lại gây đúng lỗi 'Out of range float values are not
    JSON compliant' như lần trước nếu chỉ check kiểu float thông thường."""
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    return v


def compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Tính SMA20/EMA12/EMA26/RSI14/Bollinger Bands THẬT từ giá đóng cửa
    thật — thay thế dần cho các field adx/rsi/macd hardcode ở buildMockResponse
    bên route.ts (những field đó KHÔNG được xóa ở bản vá này để tránh phá
    vỡ hợp đồng dữ liệu hiện có, nhưng nên được frontend chuyển sang dùng
    field `computedIndicators` mới này khi sẵn sàng)."""
    df = df.copy()
    df["sma_20"] = df["close"].rolling(window=20, min_periods=1).mean()
    df["ema_12"] = df["close"].ewm(span=12, adjust=False).mean()
    df["ema_26"] = df["close"].ewm(span=26, adjust=False).mean()

    delta = df["close"].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / 14, min_periods=14, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / 14, min_periods=14, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, pd.NA)
    df["rsi_14"] = 100 - (100 / (1 + rs))

    bb_mid = df["close"].rolling(window=20, min_periods=1).mean()
    bb_std = df["close"].rolling(window=20, min_periods=1).std()
    df["bb_upper"] = bb_mid + 2 * bb_std
    df["bb_lower"] = bb_mid - 2 * bb_std
    df["bb_mid"] = bb_mid

    return df


@app.get("/api/stock")
def get_stock(
    symbol: str = Query(..., min_length=1, max_length=10, description="Mã cổ phiếu, vd VNM"),
    timeframe: str = Query("D", description="D | W | M"),
    start_date: Optional[str] = Query(None, description="YYYY-MM-DD, mặc định tự tính đủ nến"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD, mặc định hôm nay"),
):
    symbol = symbol.upper().strip()
    interval = INTERVAL_MAP.get(timeframe.upper(), "1D")

    if not end_date:
        end_date = date.today().isoformat()
    if not start_date:
        lookback = DEFAULT_LOOKBACK_DAYS.get(interval, 800)
        start_date = (date.today() - timedelta(days=lookback)).isoformat()

    try:
        df = fetch_ohlcv(symbol, start_date, end_date, interval)
    except Exception as e:  # noqa: BLE001 — cần bắt mọi lỗi từ thư viện ngoài để trả JSON lỗi rõ ràng, không để Vercel trả 500 rỗng
        raise HTTPException(status_code=502, detail=f"Lỗi khi gọi vnstock cho {symbol}: {e}")

    if df is None or len(df) == 0:
        raise HTTPException(status_code=404, detail=f"Không có dữ liệu lịch sử cho mã {symbol}.")

    df = df.sort_values("time").reset_index(drop=True)
    df = compute_indicators(df)

    records = df.to_dict(orient="records")

    return {
        "ticker": symbol,
        "timeframe": timeframe.upper(),
        "isMock": False,  # priceSeries dưới đây là dữ liệu THẬT từ vnstock
        "priceDataSource": "vnstock",
        "barCount": len(records),
        "asOfDate": date.today().isoformat(),
        "priceSeries": [
            {
                "time": str(r["time"])[:10],
                "open": safe_float(r["open"]),
                "high": safe_float(r["high"]),
                "low": safe_float(r["low"]),
                "close": safe_float(r["close"]),
                "volume": safe_float(r["volume"]),
            }
            for r in records
        ],
        "computedIndicators": [
            {
                "time": str(r["time"])[:10],
                "sma20": safe_float(r.get("sma_20")),
                "ema12": safe_float(r.get("ema_12")),
                "ema26": safe_float(r.get("ema_26")),
                "rsi14": safe_float(r.get("rsi_14")),
                "bbUpper": safe_float(r.get("bb_upper")),
                "bbMid": safe_float(r.get("bb_mid")),
                "bbLower": safe_float(r.get("bb_lower")),
            }
            for r in records
        ],
    }


@app.get("/api/health")
def health():
    return {"status": "ok"}
