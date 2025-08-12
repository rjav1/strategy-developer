from pydantic import BaseModel
from typing import List, Dict, Optional


class BacktestRequest(BaseModel):
    ticker: str
    period: str = "1y"
    initial_capital: float = 10000.0
    # Optional explicit date range. If provided, backend should prioritize these over period
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class BacktestConfig(BaseModel):
    strategy_id: str
    data_id: str
    screener_id: Optional[str] = None
    initial_capital: float = 100000
    commission: float = 0.001
    slippage: float = 0.0005


class BacktestResult(BaseModel):
    id: str
    strategy_name: str
    dataset_name: str
    performance: float
    sharpe_ratio: float
    max_drawdown: float
    total_trades: int
    win_rate: float
    equity_curve: List[float]
    trade_log: List[Dict] 