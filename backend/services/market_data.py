from __future__ import annotations
import concurrent.futures
import time
from typing import Tuple, Dict, Any
import yfinance as yf
import pandas as pd
from app.settings import Settings


def format_timestamps(timestamps) -> list[str]:
    formatted = []
    for ts in timestamps:
        if hasattr(ts, 'strftime'):
            formatted.append(ts.strftime('%Y-%m-%d %H:%M:%S'))
        else:
            formatted.append(str(ts))
    return formatted


def fetch_history_with_timeout(symbol: str, period: str, interval: str | None = None, timeout: int | None = None) -> Tuple[pd.DataFrame, Dict[str, Any] | None]:
    settings = Settings()
    timeout = timeout or settings.yfinance_timeout
    ticker = yf.Ticker(symbol)

    def fetch_data():
        try:
            if interval:
                hist = ticker.history(period=period, interval=interval, timeout=settings.yfinance_timeout)
            else:
                hist = ticker.history(period=period, timeout=settings.yfinance_timeout)
            if hist.empty:
                return None, None
            try:
                info = ticker.info
                current_price = info.get('regularMarketPrice', hist['Close'].iloc[-1])
                company_name = info.get('longName', info.get('shortName', symbol))
            except Exception:
                current_price = hist['Close'].iloc[-1]
                company_name = symbol
            return hist, {'current_price': current_price, 'name': company_name}
        except Exception:
            return None, None

    with concurrent.futures.ThreadPoolExecutor() as executor:
        future = executor.submit(fetch_data)
        hist, info_data = future.result(timeout=timeout)
        return hist, info_data 