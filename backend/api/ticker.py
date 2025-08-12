from fastapi import APIRouter, HTTPException, Query
from models.market import TickerData
from services.market_data import fetch_history_with_timeout, format_timestamps

router = APIRouter(prefix="", tags=["ticker"])


@router.get("/ticker/{symbol}", response_model=TickerData)
async def get_ticker_data(symbol: str, range: str = Query(default="1d", regex="^(1d|1w|1m|3m|6m|1y|2y|5y|max)$")):
    period_map = {
        "1d": "1d", "1w": "5d", "1m": "1mo", "3m": "3mo",
        "6m": "6mo", "1y": "1y", "2y": "2y", "5y": "5y", "max": "max"
    }
    interval_map = {
        "1d": "5m",
        "1w": "1d", "1m": "1d", "3m": "1d",
        "6m": "1d", "1y": "1d", "2y": "1d", "5y": "1d", "max": "1d"
    }

    hist, info_data = fetch_history_with_timeout(symbol.upper(), period_map[range], interval_map.get(range))
    if hist is None or hist.empty or not info_data:
        raise HTTPException(status_code=404, detail=f"No historical data found for ticker '{symbol}'")

    current_price = info_data['current_price']
    previous_close = hist['Close'].iloc[-2] if len(hist) > 1 else current_price
    daily_change = current_price - previous_close
    daily_change_percent = (daily_change / previous_close * 100) if previous_close != 0 else 0

    return TickerData(
        symbol=symbol.upper(),
        name=info_data['name'],
        current_price=float(current_price),
        daily_change=float(daily_change),
        daily_change_percent=float(daily_change_percent),
        timestamps=format_timestamps(hist.index.tolist()),
        prices=hist['Close'].tolist(),
        highs=hist['High'].tolist(),
        lows=hist['Low'].tolist(),
        opens=hist['Open'].tolist(),
        volumes=hist['Volume'].fillna(0).astype(int).tolist()
    ) 