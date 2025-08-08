from pydantic import BaseModel
from typing import List


class TickerData(BaseModel):
    symbol: str
    name: str
    current_price: float
    daily_change: float
    daily_change_percent: float
    timestamps: List[str]
    prices: List[float]
    highs: List[float]
    lows: List[float]
    opens: List[float]
    volumes: List[int] 