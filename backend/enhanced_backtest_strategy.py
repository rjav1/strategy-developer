"""
Enhanced Momentum Screener Backtesting Engine with Visual Playback

This module implements a comprehensive backtesting system for the momentum screener strategy,
featuring day-by-day simulation, state machine trading logic, and visual chart replay.

Key Features:
- Day-by-day historical simulation with rolling screener evaluation
- Three-state trading cycle (NOT IN TRADE, IN PROGRESS, BOUGHT)
- Integration with production momentum screener logic
- Visual chart replay highlighting momentum moves, consolidation periods, and trades
- Comprehensive trade logging and performance metrics
- Backend-to-frontend streaming communication
- matplotlib.animation for smooth playback

Usage:
    python enhanced_backtest_strategy.py --ticker ALAB --period 1y
"""

import argparse
import sys
import os
import json
import pandas as pd
import numpy as np
import yfinance as yf
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import matplotlib.animation as animation
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional, Any, Union
from dataclasses import dataclass, asdict
from enum import Enum
import warnings
import base64
import io
warnings.filterwarnings('ignore')

# Add the backend directory to the path to import existing functions
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import production momentum screener functions
try:
    from main import (
        check_momentum_pattern, 
        detect_momentum_move_boundaries, 
        detect_consolidation_pattern_new,
        calculate_atr
    )
    PRODUCTION_SCREENER_AVAILABLE = True
    print("✅ Production screener functions loaded successfully")
except ImportError as e:
    print(f"⚠️  Could not import production screener functions: {e}")
    PRODUCTION_SCREENER_AVAILABLE = False

def fetch_ohlcv(symbol: str, period_str: str) -> pd.DataFrame:
    """Fetch OHLCV data using yfinance with enhanced data preparation"""
    try:
        ticker = yf.Ticker(symbol)
        data = ticker.history(period=period_str)
        if data.empty:
            return pd.DataFrame()
        
        # Prepare data with all required fields for momentum screening
        data = data.copy()
        data['SMA10'] = data['Close'].rolling(window=10).mean()
        data['SMA20'] = data['Close'].rolling(window=20).mean()
        data['SMA50'] = data['Close'].rolling(window=50).mean()
        data['ATR'] = calculate_atr(data) if PRODUCTION_SCREENER_AVAILABLE else data['Close'].rolling(window=14).std()
        
        # Additional fields required by momentum screener
        data['daily_range_pct'] = (data['High'] - data['Low']) / data['Open'] * 100
        data['ADR_20'] = data['daily_range_pct'].rolling(window=20).mean()
        data['body_size_pct'] = abs(data['Close'] - data['Open']) / data['Open'] * 100
        data['volume_sma'] = data['Volume'].rolling(window=50).mean()
        
        return data
        
    except Exception as e:
        print(f"Error fetching data for {symbol}: {e}")
        return pd.DataFrame()

# Define data structures for trade tracking and state management

class TradingState(Enum):
    """Enhanced trading state machine states"""
    NOT_IN_TRADE = "NOT_IN_TRADE"
    IN_PROGRESS = "IN_PROGRESS"  # Passed screener, waiting for buy signal
    BOUGHT = "BOUGHT"           # Holding position

@dataclass
class Trade:
    """Enhanced trade record structure"""
    entry_date: datetime
    entry_price: float
    entry_reason: str = ""
    exit_date: Optional[datetime] = None
    exit_price: Optional[float] = None
    exit_reason: str = ""
    shares: int = 0
    stop_loss: Optional[float] = None
    target_price: Optional[float] = None
    pnl: float = 0.0
    pnl_percent: float = 0.0
    holding_days: int = 0
    max_gain: float = 0.0
    max_loss: float = 0.0
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert trade to dictionary for JSON serialization"""
        return {
            'entry_date': self.entry_date.isoformat() if self.entry_date else None,
            'entry_price': self.entry_price,
            'entry_reason': self.entry_reason,
            'exit_date': self.exit_date.isoformat() if self.exit_date else None,
            'exit_price': self.exit_price,
            'exit_reason': self.exit_reason,
            'shares': self.shares,
            'stop_loss': self.stop_loss,
            'target_price': self.target_price,
            'pnl': round(self.pnl, 2),
            'pnl_percent': round(self.pnl_percent, 2),
            'holding_days': self.holding_days,
            'max_gain': round(self.max_gain, 2),
            'max_loss': round(self.max_loss, 2)
        }

@dataclass
class MarketEvent:
    """Market event for frontend communication"""
    date: datetime
    event_type: str  # 'momentum_start', 'momentum_end', 'consolidation_start', 'consolidation_end', 'buy', 'sell'
    price: float
    volume: int
    details: Dict[str, Any]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            'date': self.date.isoformat(),
            'event_type': self.event_type,
            'price': self.price,
            'volume': self.volume,
            'details': self.details
        }

@dataclass
class HighlightPeriod:
    """Period highlighting for frontend visualization"""
    start_date: datetime
    end_date: datetime
    highlight_type: str  # 'momentum', 'consolidation'
    start_price: float
    end_price: float
    color: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            'start_date': self.start_date.isoformat(),
            'end_date': self.end_date.isoformat(),
            'type': self.highlight_type,
            'start_price': self.start_price,
            'end_price': self.end_price,
            'color': self.color or ('light_green' if self.highlight_type == 'momentum' else 'light_yellow')
        }

@dataclass
class BacktestFrame:
    """Single frame of backtest data for streaming"""
    current_date: datetime
    ohlcv: Dict[str, float]
    state: TradingState
    active_highlights: List[HighlightPeriod]
    trade_events: List[MarketEvent]
    performance_metrics: Dict[str, float]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            'current_date': self.current_date.isoformat(),
            'ohlcv': self.ohlcv,
            'state': self.state.value,
            'active_highlights': [h.to_dict() for h in self.active_highlights],
            'trade_events': [e.to_dict() for e in self.trade_events],
            'performance_metrics': self.performance_metrics
        }

class EnhancedMomentumBacktester:
    """
    Enhanced Momentum Screener Backtesting Engine
    
    Features:
    - Day-by-day simulation with production screener logic
    - Correct state machine implementation
    - Visual highlighting periods tracking
    - Backend-to-frontend streaming communication
    - matplotlib animation support
    """
    
    def __init__(self, ticker: str, period: str = "1y", initial_capital: float = 10000.0):
        self.ticker = ticker.upper()
        self.period = period
        self.initial_capital = initial_capital
        self.current_capital = initial_capital
        
        # Trading state
        self.state = TradingState.NOT_IN_TRADE
        self.current_trade: Optional[Trade] = None
        self.completed_trades: List[Trade] = []
        
        # Data storage
        self.daily_data: Optional[pd.DataFrame] = None
        
        # Tracking for visualization and frontend communication
        self.highlight_periods: List[HighlightPeriod] = []
        self.market_events: List[MarketEvent] = []
        self.backtest_frames: List[BacktestFrame] = []
        
        # Current detected patterns
        self.current_momentum_period: Optional[HighlightPeriod] = None
        self.current_consolidation_period: Optional[HighlightPeriod] = None
        
        # Performance tracking
        self.daily_equity: List[float] = []
        self.daily_returns: List[float] = []
        
        print(f"✅ Enhanced MomentumBacktester initialized for {self.ticker}")
    
    def fetch_data(self) -> bool:
        """Fetch and prepare data for backtesting"""
        try:
            print(f"📊 Fetching data for {self.ticker} ({self.period})...")
            self.daily_data = fetch_ohlcv(self.ticker, self.period)
            
            if self.daily_data is None or len(self.daily_data) < 100:
                print(f"❌ Insufficient data: {len(self.daily_data) if self.daily_data is not None else 0} days")
                return False
            
            print(f"✅ Fetched {len(self.daily_data)} days of data")
            print(f"📅 Date range: {self.daily_data.index[0].date()} to {self.daily_data.index[-1].date()}")
            return True
            
        except Exception as e:
            print(f"❌ Error fetching data: {e}")
            return False
    
    def run_daily_screener(self, current_date: datetime, lookback_data: pd.DataFrame) -> Tuple[bool, Dict, float]:
        """Run the production momentum screener on current data"""
        if not PRODUCTION_SCREENER_AVAILABLE:
            print("⚠️  Production screener not available, using fallback logic")
            return self._fallback_screener(lookback_data)
        
        try:
            return check_momentum_pattern(lookback_data, self.ticker)
        except Exception as e:
            print(f"⚠️  Error in production screener: {e}, using fallback")
            return self._fallback_screener(lookback_data)
    
    def _fallback_screener(self, data: pd.DataFrame) -> Tuple[bool, Dict, float]:
        """Fallback screener logic if production screener is unavailable"""
        if len(data) < 50:
            return False, {}, 0.0
        
        current_price = data['Close'].iloc[-1]
        sma20 = data['SMA20'].iloc[-1]
        sma10 = data['SMA10'].iloc[-1]
        
        if pd.isna(sma20) or pd.isna(sma10):
            return False, {}, 0.0
        
        # Simple momentum criteria
        price_above_sma20 = current_price > sma20
        sma10_above_sma20 = sma10 > sma20
        momentum_strength = ((current_price - sma20) / sma20) * 100 if sma20 > 0 else 0
        
        pattern_found = price_above_sma20 and sma10_above_sma20 and momentum_strength > 5.0
        
        return pattern_found, {'momentum_strength': momentum_strength}, momentum_strength
    
    def update_highlights_and_events(self, current_date: datetime, current_idx: int, 
                                   screener_result: Tuple[bool, Dict, float]) -> List[MarketEvent]:
        """Update highlight periods and generate market events based on screener analysis"""
        events = []
        pattern_found, criteria_details, confidence = screener_result
        
        if not PRODUCTION_SCREENER_AVAILABLE or not pattern_found:
            return events
        
        try:
            # Get momentum move boundaries
            lookback_data = self.daily_data.iloc[:current_idx+1]
            start_idx, end_idx, move_pct, move_details = detect_momentum_move_boundaries(lookback_data)
            
            # Update momentum period highlighting
            if start_idx != -1 and end_idx != -1:
                momentum_start_date = lookback_data.index[start_idx]
                momentum_end_date = lookback_data.index[end_idx]
                
                # Check if this is a new momentum period
                if (self.current_momentum_period is None or 
                    self.current_momentum_period.start_date != momentum_start_date or
                    self.current_momentum_period.end_date != momentum_end_date):
                    
                    # End previous momentum period if exists
                    if self.current_momentum_period is not None:
                        events.append(MarketEvent(
                            date=self.current_momentum_period.end_date,
                            event_type='momentum_end',
                            price=self.current_momentum_period.end_price,
                            volume=int(lookback_data.loc[self.current_momentum_period.end_date]['Volume']),
                            details={'move_pct': move_pct}
                        ))
                    
                    # Create new momentum period
                    self.current_momentum_period = HighlightPeriod(
                        start_date=momentum_start_date,
                        end_date=momentum_end_date,
                        highlight_type='momentum',
                        start_price=lookback_data.iloc[start_idx]['Low'],
                        end_price=lookback_data.iloc[end_idx]['High'],
                        color='light_green'
                    )
                    
                    # Add to highlights list
                    self.highlight_periods.append(self.current_momentum_period)
                    
                    # Generate momentum start event
                    events.append(MarketEvent(
                        date=momentum_start_date,
                        event_type='momentum_start',
                        price=self.current_momentum_period.start_price,
                        volume=int(lookback_data.loc[momentum_start_date]['Volume']),
                        details={'expected_move_pct': move_pct, 'move_details': move_details}
                    ))
            
            # Check for consolidation patterns
            if start_idx != -1 and end_idx != -1:
                current_adr = lookback_data['ADR_20'].iloc[-1] if 'ADR_20' in lookback_data.columns else 5.0
                consolidation_found, consolidation_details = detect_consolidation_pattern_new(
                    lookback_data, start_idx, end_idx, current_adr
                )
                
                if consolidation_found:
                    consol_start_idx = consolidation_details.get('consolidation_start_idx', end_idx + 1)
                    consol_end_idx = consolidation_details.get('consolidation_end_idx', current_idx)
                    
                    if consol_start_idx < len(lookback_data) and consol_end_idx < len(lookback_data):
                        consol_start_date = lookback_data.index[consol_start_idx]
                        consol_end_date = lookback_data.index[consol_end_idx]
                        
                        # Check if this is a new consolidation period
                        if (self.current_consolidation_period is None or
                            self.current_consolidation_period.start_date != consol_start_date):
                            
                            # End previous consolidation if exists
                            if self.current_consolidation_period is not None:
                                events.append(MarketEvent(
                                    date=self.current_consolidation_period.end_date,
                                    event_type='consolidation_end',
                                    price=self.current_consolidation_period.end_price,
                                    volume=int(lookback_data.loc[self.current_consolidation_period.end_date]['Volume']),
                                    details={}
                                ))
                            
                            # Create new consolidation period
                            self.current_consolidation_period = HighlightPeriod(
                                start_date=consol_start_date,
                                end_date=consol_end_date,
                                highlight_type='consolidation',
                                start_price=lookback_data.iloc[consol_start_idx]['Close'],
                                end_price=lookback_data.iloc[consol_end_idx]['Close'],
                                color='light_yellow'
                            )
                            
                            # Add to highlights list
                            self.highlight_periods.append(self.current_consolidation_period)
                            
                            # Generate consolidation start event
                            events.append(MarketEvent(
                                date=consol_start_date,
                                event_type='consolidation_start',
                                price=self.current_consolidation_period.start_price,
                                volume=int(lookback_data.loc[consol_start_date]['Volume']),
                                details=consolidation_details
                            ))
        
        except Exception as e:
            print(f"⚠️  Error updating highlights: {e}")
        
        return events
    
    def check_buy_signal(self, current_date: datetime, current_row: pd.Series) -> bool:
        """Check for buy signal when in IN_PROGRESS state"""
        if self.state != TradingState.IN_PROGRESS:
            return False
        
        # Simple buy signal: breakout above previous day high with volume confirmation
        if len(self.daily_data) < 2:
            return False
        
        current_idx = self.daily_data.index.get_loc(current_date)
        if current_idx == 0:
            return False
        
        prev_high = self.daily_data.iloc[current_idx - 1]['High']
        current_high = current_row['High']
        current_volume = current_row['Volume']
        avg_volume = self.daily_data.iloc[max(0, current_idx-20):current_idx]['Volume'].mean()
        
        # Buy conditions: breakout + volume confirmation
        breakout = current_high > prev_high
        volume_confirmation = current_volume > avg_volume * 1.2
        
        return breakout and volume_confirmation
    
    def check_sell_signal(self, current_date: datetime, current_row: pd.Series) -> Tuple[bool, str]:
        """Check for sell signal when in BOUGHT state"""
        if self.state != TradingState.BOUGHT or self.current_trade is None:
            return False, ""
        
        current_price = current_row['Close']
        entry_price = self.current_trade.entry_price
        holding_days = (current_date - self.current_trade.entry_date).days
        
        # Stop loss (2% below entry)
        if current_price <= entry_price * 0.98:
            return True, "Stop Loss"
        
        # Take profit (4% above entry for 2:1 R/R)
        if current_price >= entry_price * 1.04:
            return True, "Take Profit"
        
        # Time-based exit (30 days max hold)
        if holding_days >= 30:
            return True, "Time Exit"
        
        # Momentum failure (close below 10-day SMA)
        if 'SMA10' in self.daily_data.columns:
            current_idx = self.daily_data.index.get_loc(current_date)
            sma10 = self.daily_data.iloc[current_idx]['SMA10']
            if not pd.isna(sma10) and current_price < sma10 * 0.97:  # 3% buffer
                return True, "Momentum Failure"
        
        return False, ""
    
    def execute_buy(self, current_date: datetime, current_row: pd.Series) -> MarketEvent:
        """Execute buy order"""
        buy_price = current_row['Close']  # Use close price for execution
        shares = int(self.current_capital * 0.95 / buy_price)  # Use 95% of capital
        
        self.current_trade = Trade(
            entry_date=current_date,
            entry_price=buy_price,
            entry_reason="Momentum Breakout",
            shares=shares,
            stop_loss=buy_price * 0.98,
            target_price=buy_price * 1.04
        )
        
        self.current_capital -= shares * buy_price
        self.state = TradingState.BOUGHT
        
        event = MarketEvent(
            date=current_date,
            event_type='buy',
            price=buy_price,
            volume=int(current_row['Volume']),
            details={
                'shares': shares,
                'cost_basis': shares * buy_price,
                'stop_loss': self.current_trade.stop_loss,
                'target_price': self.current_trade.target_price
            }
        )
        
        print(f"🟢 BUY: {shares} shares of {self.ticker} at ${buy_price:.2f} on {current_date.date()}")
        return event
    
    def execute_sell(self, current_date: datetime, current_row: pd.Series, reason: str) -> MarketEvent:
        """Execute sell order"""
        if self.current_trade is None:
            raise ValueError("No current trade to sell")
        
        sell_price = current_row['Close']
        shares = self.current_trade.shares
        proceeds = shares * sell_price
        
        # Update trade details
        self.current_trade.exit_date = current_date
        self.current_trade.exit_price = sell_price
        self.current_trade.exit_reason = reason
        self.current_trade.holding_days = (current_date - self.current_trade.entry_date).days
        self.current_trade.pnl = proceeds - (shares * self.current_trade.entry_price)
        self.current_trade.pnl_percent = (self.current_trade.pnl / (shares * self.current_trade.entry_price)) * 100
        
        # Update capital
        self.current_capital += proceeds
        
        # Complete the trade
        trade_to_complete = self.current_trade
        self.completed_trades.append(trade_to_complete)
        self.current_trade = None
        self.state = TradingState.NOT_IN_TRADE
        
        event = MarketEvent(
            date=current_date,
            event_type='sell',
            price=sell_price,
            volume=int(current_row['Volume']),
            details={
                'shares': shares,
                'proceeds': proceeds,
                'pnl': trade_to_complete.pnl,
                'pnl_percent': trade_to_complete.pnl_percent,
                'reason': reason
            }
        )
        
        print(f"🔴 SELL: {shares} shares of {self.ticker} at ${sell_price:.2f} on {current_date.date()} ({reason}) - P&L: ${trade_to_complete.pnl:.2f}")
        return event
    
    def calculate_daily_performance(self, current_date: datetime, current_price: float) -> Dict[str, float]:
        """Calculate daily performance metrics"""
        # Current portfolio value
        position_value = 0.0
        if self.current_trade is not None:
            position_value = self.current_trade.shares * current_price
        
        total_equity = self.current_capital + position_value
        self.daily_equity.append(total_equity)
        
        # Calculate returns
        if len(self.daily_equity) > 1:
            daily_return = (total_equity - self.daily_equity[-2]) / self.daily_equity[-2]
            self.daily_returns.append(daily_return)
        else:
            self.daily_returns.append(0.0)
        
        # Calculate performance metrics
        total_return = (total_equity - self.initial_capital) / self.initial_capital
        
        metrics = {
            'total_equity': total_equity,
            'total_return_pct': total_return * 100,
            'total_trades': len(self.completed_trades),
            'open_trades': 1 if self.current_trade else 0,
            'current_capital': self.current_capital,
            'position_value': position_value
        }
        
        # Add trade-based metrics if we have completed trades
        if self.completed_trades:
            pnls = [trade.pnl for trade in self.completed_trades]
            winning_trades = [pnl for pnl in pnls if pnl > 0]
            
            metrics.update({
                'win_rate': len(winning_trades) / len(pnls) * 100,
                'avg_win': np.mean(winning_trades) if winning_trades else 0,
                'avg_loss': np.mean([pnl for pnl in pnls if pnl <= 0]) if any(pnl <= 0 for pnl in pnls) else 0,
                'total_pnl': sum(pnls),
                'max_drawdown': self.calculate_max_drawdown()
            })
        
        return metrics
    
    def calculate_max_drawdown(self) -> float:
        """Calculate maximum drawdown from equity curve"""
        if len(self.daily_equity) < 2:
            return 0.0
        
        equity_series = pd.Series(self.daily_equity)
        rolling_max = equity_series.expanding().max()
        drawdown = (equity_series - rolling_max) / rolling_max
        return abs(drawdown.min()) * 100
    
    def run_simulation(self) -> bool:
        """Run the complete day-by-day simulation"""
        if self.daily_data is None:
            print("❌ No data available for simulation")
            return False
        
        print(f"🚀 Starting simulation for {self.ticker}")
        print(f"💰 Initial capital: ${self.initial_capital:,.2f}")
        print(f"📅 Period: {self.daily_data.index[0].date()} to {self.daily_data.index[-1].date()}")
        print("=" * 80)
        
        # Start simulation from day 50 to have sufficient lookback data
        start_idx = 50
        total_days = len(self.daily_data)
        
        for current_idx in range(start_idx, total_days):
            current_date = self.daily_data.index[current_idx]
            current_row = self.daily_data.iloc[current_idx]
            
            # Get lookback data for screener analysis
            lookback_data = self.daily_data.iloc[:current_idx+1]
            
            # Progress reporting
            if current_idx % 20 == 0:
                progress = (current_idx - start_idx) / (total_days - start_idx) * 100
                print(f"📊 Progress: {progress:.1f}% - {current_date.date()} - State: {self.state.value}")
            
            # Run daily screener
            screener_result = self.run_daily_screener(current_date, lookback_data)
            pattern_found, criteria_details, confidence = screener_result
            
            # Update highlights and generate market events
            daily_events = self.update_highlights_and_events(current_date, current_idx, screener_result)
            
            # State machine logic
            if self.state == TradingState.NOT_IN_TRADE:
                if pattern_found and confidence > 60:  # Threshold for pattern strength
                    self.state = TradingState.IN_PROGRESS
                    print(f"🟡 IN_PROGRESS: Pattern detected for {self.ticker} on {current_date.date()}")
            
            elif self.state == TradingState.IN_PROGRESS:
                if pattern_found and confidence > 60:
                    # Check for buy signal
                    if self.check_buy_signal(current_date, current_row):
                        buy_event = self.execute_buy(current_date, current_row)
                        daily_events.append(buy_event)
                else:
                    # Pattern no longer valid, revert to NOT_IN_TRADE
                    self.state = TradingState.NOT_IN_TRADE
                    print(f"🔄 NOT_IN_TRADE: Pattern failed for {self.ticker} on {current_date.date()}")
            
            elif self.state == TradingState.BOUGHT:
                # Check for sell signal
                should_sell, sell_reason = self.check_sell_signal(current_date, current_row)
                if should_sell:
                    sell_event = self.execute_sell(current_date, current_row, sell_reason)
                    daily_events.append(sell_event)
            
            # Calculate daily performance
            performance_metrics = self.calculate_daily_performance(current_date, current_row['Close'])
            
            # Create frame for frontend streaming
            active_highlights = []
            if self.current_momentum_period and current_date >= self.current_momentum_period.start_date:
                active_highlights.append(self.current_momentum_period)
            if self.current_consolidation_period and current_date >= self.current_consolidation_period.start_date:
                active_highlights.append(self.current_consolidation_period)
            
            frame = BacktestFrame(
                current_date=current_date,
                ohlcv={
                    'open': current_row['Open'],
                    'high': current_row['High'],
                    'low': current_row['Low'],
                    'close': current_row['Close'],
                    'volume': current_row['Volume']
                },
                state=self.state,
                active_highlights=active_highlights,
                trade_events=daily_events,
                performance_metrics=performance_metrics
            )
            
            self.backtest_frames.append(frame)
            self.market_events.extend(daily_events)
        
        print("=" * 80)
        print(f"✅ Simulation completed for {self.ticker}")
        return True
    
    def generate_results(self) -> Dict[str, Any]:
        """Generate comprehensive backtest results"""
        if not self.backtest_frames:
            return {"success": False, "error": "No simulation data available"}
        
        # Final performance metrics
        final_metrics = self.backtest_frames[-1].performance_metrics
        
        # Trade statistics
        trade_stats = {
            "total_trades": len(self.completed_trades),
            "winning_trades": len([t for t in self.completed_trades if t.pnl > 0]),
            "losing_trades": len([t for t in self.completed_trades if t.pnl <= 0]),
            "win_rate": final_metrics.get('win_rate', 0),
            "total_pnl": final_metrics.get('total_pnl', 0),
            "total_return_pct": final_metrics.get('total_return_pct', 0),
            "max_drawdown": final_metrics.get('max_drawdown', 0),
            "avg_win": final_metrics.get('avg_win', 0),
            "avg_loss": final_metrics.get('avg_loss', 0),
            "profit_factor": abs(final_metrics.get('avg_win', 0) / final_metrics.get('avg_loss', 1)) if final_metrics.get('avg_loss', 0) != 0 else 0,
            "sharpe_ratio": self.calculate_sharpe_ratio()
        }
        
        # Prepare enhanced data for frontend
        price_data = []
        for i, frame in enumerate(self.backtest_frames):
            # Calculate momentum strength and ATR for this frame
            momentum_strength = self._calculate_momentum_strength_for_frame(frame, i)
            atr = self._calculate_atr_for_frame(frame, i)
            
            price_data.append({
                "date": frame.current_date.isoformat(),
                "open": frame.ohlcv['open'],
                "high": frame.ohlcv['high'],
                "low": frame.ohlcv['low'],
                "close": frame.ohlcv['close'],
                "price": frame.ohlcv['close'],  # For frontend compatibility
                "volume": frame.ohlcv['volume'],
                "trading_state": frame.current_state.value if hasattr(frame, 'current_state') else 'NOT_IN_TRADE',
                "momentum_strength": momentum_strength,
                "atr": atr
            })
        
        # Prepare trades for frontend with numbering
        trades_data = []
        for i, trade in enumerate(self.completed_trades, 1):
            trade_dict = trade.to_dict()
            trade_dict['trade_number'] = i
            trades_data.append(trade_dict)
        
        # Prepare highlights for frontend
        highlights_data = [highlight.to_dict() for highlight in self.highlight_periods]
        
        # Generate static chart
        chart_path = self.generate_static_chart()
        
        return {
            "success": True,
            "results": trade_stats,
            "trades": trades_data,
            "price_data": price_data,
            "momentum_periods": highlights_data,
            "market_events": [event.to_dict() for event in self.market_events],
            "backtest_frames": [frame.to_dict() for frame in self.backtest_frames],
            "chart_path": chart_path,
            "ticker": self.ticker,
            "period": self.period,
            "initial_capital": self.initial_capital
        }
    
    def calculate_sharpe_ratio(self) -> float:
        """Calculate Sharpe ratio from daily returns"""
        if len(self.daily_returns) < 2:
            return 0.0
        
        returns_series = pd.Series(self.daily_returns)
        if returns_series.std() == 0:
            return 0.0
        
        # Annualized Sharpe ratio (assuming 252 trading days)
        return (returns_series.mean() * 252) / (returns_series.std() * np.sqrt(252))
    
    def _calculate_momentum_strength_for_frame(self, frame: 'BacktestFrame', frame_index: int) -> float:
        """Calculate momentum strength (0-100) for a specific frame"""
        try:
            if frame_index < 10:  # Need at least 10 frames
                return 0.0
            
            current_price = frame.ohlcv['close']
            
            # Look at 10-frame price change
            if frame_index >= 10:
                ten_frames_ago = self.backtest_frames[frame_index - 10]
                ten_frames_price = ten_frames_ago.ohlcv['close']
                price_change = (current_price - ten_frames_price) / ten_frames_price
            else:
                price_change = 0.0
            
            # Look at volume trend (5-frame average vs 20-frame average)
            if frame_index >= 20:
                vol_5_avg = np.mean([self.backtest_frames[i].ohlcv['volume'] for i in range(frame_index-5, frame_index)])
                vol_20_avg = np.mean([self.backtest_frames[i].ohlcv['volume'] for i in range(frame_index-20, frame_index)])
                volume_strength = vol_5_avg / vol_20_avg if vol_20_avg > 0 else 1.0
            else:
                volume_strength = 1.0
            
            # Combine price momentum and volume strength
            momentum = (price_change * 100) + ((volume_strength - 1) * 20)
            return max(0, min(100, momentum + 50))  # Normalize to 0-100
            
        except Exception:
            return 0.0
    
    def _calculate_atr_for_frame(self, frame: 'BacktestFrame', frame_index: int) -> float:
        """Calculate Average True Range for a specific frame"""
        try:
            if frame_index < 14:  # Need 14 frames for ATR
                return 0.0
            
            # Calculate True Range for last 14 frames
            tr_values = []
            for i in range(frame_index - 13, frame_index + 1):
                if i <= 0:
                    continue
                
                current = self.backtest_frames[i]
                previous = self.backtest_frames[i - 1]
                
                high_low = current.ohlcv['high'] - current.ohlcv['low']
                high_close_prev = abs(current.ohlcv['high'] - previous.ohlcv['close'])
                low_close_prev = abs(current.ohlcv['low'] - previous.ohlcv['close'])
                
                tr = max(high_low, high_close_prev, low_close_prev)
                tr_values.append(tr)
            
            return sum(tr_values) / len(tr_values) if tr_values else 0.0
            
        except Exception:
            return 0.0
    
    def generate_static_chart(self) -> str:
        """Generate static matplotlib chart for backend analysis"""
        try:
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(15, 10), 
                                          gridspec_kw={'height_ratios': [3, 1]}, sharex=True)
            
            # Prepare data
            dates = [frame.current_date for frame in self.backtest_frames]
            prices = [frame.ohlcv['close'] for frame in self.backtest_frames]
            volumes = [frame.ohlcv['volume'] for frame in self.backtest_frames]
            
            # Price chart
            ax1.plot(dates, prices, 'b-', linewidth=1, alpha=0.8, label=f'{self.ticker} Price')
            
            # Highlight periods
            for highlight in self.highlight_periods:
                if highlight.highlight_type == 'momentum':
                    ax1.axvspan(highlight.start_date, highlight.end_date, 
                               alpha=0.2, color='green', label='Momentum' if 'Momentum' not in [l.get_label() for l in ax1.get_lines()] else "")
                elif highlight.highlight_type == 'consolidation':
                    ax1.axvspan(highlight.start_date, highlight.end_date, 
                               alpha=0.2, color='yellow', label='Consolidation' if 'Consolidation' not in [l.get_label() for l in ax1.get_lines()] else "")
            
            # Trade markers
            for trade in self.completed_trades:
                # Buy marker
                ax1.scatter(trade.entry_date, trade.entry_price, color='green', marker='^', 
                           s=100, zorder=5, alpha=0.8)
                # Sell marker
                if trade.exit_date and trade.exit_price:
                    ax1.scatter(trade.exit_date, trade.exit_price, color='red', marker='v', 
                               s=100, zorder=5, alpha=0.8)
            
            ax1.set_title(f'{self.ticker} - Enhanced Momentum Screener Backtest', fontsize=14, fontweight='bold')
            ax1.set_ylabel('Price ($)', fontsize=12)
            ax1.legend(loc='upper left')
            ax1.grid(True, alpha=0.3)
            
            # Volume chart
            ax2.bar(dates, volumes, width=1, alpha=0.6, color='blue')
            ax2.set_ylabel('Volume', fontsize=12)
            ax2.set_xlabel('Date', fontsize=12)
            ax2.grid(True, alpha=0.3)
            
            # Format dates
            fig.autofmt_xdate()
            
            plt.tight_layout()
            
            # Save chart
            chart_filename = f"{self.ticker}_enhanced_backtest_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
            chart_path = os.path.join(os.path.dirname(__file__), 'charts', chart_filename)
            
            # Create charts directory if it doesn't exist
            os.makedirs(os.path.dirname(chart_path), exist_ok=True)
            
            plt.savefig(chart_path, dpi=300, bbox_inches='tight')
            plt.close()
            
            print(f"📊 Static chart saved: {chart_path}")
            return chart_path
            
        except Exception as e:
            print(f"⚠️  Error generating static chart: {e}")
            return ""
    
    def create_animation(self, output_path: str = None, fps: int = 2) -> str:
        """Create matplotlib animation of the backtest"""
        if not self.backtest_frames:
            print("❌ No frames available for animation")
            return ""
        
        try:
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 8), 
                                          gridspec_kw={'height_ratios': [3, 1]}, sharex=True)
            
            def animate(frame_idx):
                ax1.clear()
                ax2.clear()
                
                # Get data up to current frame
                current_frames = self.backtest_frames[:frame_idx+1]
                dates = [f.current_date for f in current_frames]
                prices = [f.ohlcv['close'] for f in current_frames]
                volumes = [f.ohlcv['volume'] for f in current_frames]
                
                # Plot price
                ax1.plot(dates, prices, 'b-', linewidth=2)
                
                # Add current highlights
                current_frame = self.backtest_frames[frame_idx]
                for highlight in current_frame.active_highlights:
                    if highlight.highlight_type == 'momentum':
                        ax1.axvspan(highlight.start_date, min(highlight.end_date, current_frame.current_date), 
                                   alpha=0.3, color='green')
                    elif highlight.highlight_type == 'consolidation':
                        ax1.axvspan(highlight.start_date, min(highlight.end_date, current_frame.current_date), 
                                   alpha=0.3, color='yellow')
                
                # Add trade markers up to current frame
                for trade in self.completed_trades:
                    if trade.entry_date <= current_frame.current_date:
                        ax1.scatter(trade.entry_date, trade.entry_price, color='green', marker='^', s=100)
                    if trade.exit_date and trade.exit_date <= current_frame.current_date:
                        ax1.scatter(trade.exit_date, trade.exit_price, color='red', marker='v', s=100)
                
                ax1.set_title(f'{self.ticker} - Live Backtest ({current_frame.current_date.date()}) - State: {current_frame.state.value}')
                ax1.set_ylabel('Price ($)')
                ax1.grid(True, alpha=0.3)
                
                # Volume
                ax2.bar(dates, volumes, width=1, alpha=0.6)
                ax2.set_ylabel('Volume')
                ax2.set_xlabel('Date')
                ax2.grid(True, alpha=0.3)
                
                plt.tight_layout()
            
            # Create animation
            anim = animation.FuncAnimation(fig, animate, frames=len(self.backtest_frames), 
                                         interval=1000//fps, blit=False, repeat=True)
            
            # Save animation
            if output_path is None:
                output_path = f"{self.ticker}_enhanced_backtest_animation_{datetime.now().strftime('%Y%m%d_%H%M%S')}.mp4"
            
            animation_dir = os.path.join(os.path.dirname(__file__), 'animations')
            os.makedirs(animation_dir, exist_ok=True)
            full_output_path = os.path.join(animation_dir, output_path)
            
            anim.save(full_output_path, writer='pillow', fps=fps)
            plt.close()
            
            print(f"🎬 Animation saved: {full_output_path}")
            return full_output_path
            
        except Exception as e:
            print(f"⚠️  Error creating animation: {e}")
            return ""

# Maintain compatibility with existing API
class MomentumBacktester(EnhancedMomentumBacktester):
    """Compatibility wrapper for existing API"""
    
    def run_backtest(self) -> Dict[str, Any]:
        """Run backtest and return results in expected format"""
        if not self.run_simulation():
            return {"success": False, "error": "Simulation failed"}
        
        return self.generate_results()

# CLI interface
def main():
    """Command-line interface for running backtests"""
    parser = argparse.ArgumentParser(description='Enhanced Momentum Screener Backtest')
    parser.add_argument('--ticker', type=str, required=True, help='Stock ticker symbol')
    parser.add_argument('--period', type=str, default='1y', help='Time period (6mo, 1y, 2y, 5y)')
    parser.add_argument('--capital', type=float, default=10000, help='Initial capital')
    parser.add_argument('--save-chart', action='store_true', help='Save static chart')
    parser.add_argument('--create-animation', action='store_true', help='Create animation')
    parser.add_argument('--export-frames', action='store_true', help='Export all frames as JSON')
    
    args = parser.parse_args()
    
    print("🚀 Enhanced Momentum Screener Backtest Engine")
    print("=" * 60)
    
    # Initialize backtester
    backtester = EnhancedMomentumBacktester(
        ticker=args.ticker,
        period=args.period,
        initial_capital=args.capital
    )
    
    # Fetch data
    if not backtester.fetch_data():
        print("❌ Failed to fetch data")
        return
    
    # Run simulation
    if not backtester.run_simulation():
        print("❌ Simulation failed")
        return
    
    # Generate results
    results = backtester.generate_results()
    
    if results["success"]:
        # Print summary
        print("\n📊 BACKTEST RESULTS")
        print("=" * 40)
        metrics = results["results"]
        print(f"Total Trades: {metrics['total_trades']}")
        print(f"Win Rate: {metrics['win_rate']:.1f}%")
        print(f"Total Return: {metrics['total_return_pct']:.2f}%")
        print(f"Total P&L: ${metrics['total_pnl']:.2f}")
        print(f"Max Drawdown: {metrics['max_drawdown']:.2f}%")
        print(f"Sharpe Ratio: {metrics['sharpe_ratio']:.2f}")
        print(f"Profit Factor: {metrics['profit_factor']:.2f}")
        
        # Trade details
        print(f"\n📋 TRADE LOG ({len(results['trades'])} trades)")
        print("-" * 60)
        for i, trade in enumerate(results['trades'], 1):
            print(f"{i}. {trade['entry_date'][:10]} -> {trade['exit_date'][:10] if trade['exit_date'] else 'Open'}")
            print(f"   ${trade['entry_price']:.2f} -> ${trade['exit_price']:.2f if trade['exit_price'] else 'N/A'}")
            print(f"   P&L: ${trade['pnl']:.2f} ({trade['pnl_percent']:.1f}%) - {trade['exit_reason']}")
        
        # Save static chart if requested
        if args.save_chart:
            backtester.generate_static_chart()
        
        # Create animation if requested
        if args.create_animation:
            backtester.create_animation()
        
        # Export frames if requested
        if args.export_frames:
            frames_file = f"{args.ticker}_frames_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            with open(frames_file, 'w') as f:
                json.dump(results['backtest_frames'], f, indent=2)
            print(f"💾 Frames exported to: {frames_file}")
    
    else:
        print(f"❌ Backtest failed: {results.get('error', 'Unknown error')}")

if __name__ == "__main__":
    main()