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
    python backtest_strategy.py --ticker ALAB --period 1y
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
    from services.momentum import (
        check_momentum_pattern,
        detect_momentum_move_boundaries,
        calculate_atr,
    )
    from services.consolidation import detect_consolidation_pattern_new
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
    
    return pattern_found, criteria_details, momentum_strength

# Import breakout strategy functions (fallback to our own implementations if not available)
try:
    from strategies.breakout_strategy import (
        calculate_consolidation_range,
        detect_breakout,
        check_five_minute_high_break,
        calculate_volume_criteria,
        calculate_stop_loss
    )
    BREAKOUT_STRATEGY_AVAILABLE = True
except ImportError:
    print("Note: Breakout strategy module not found. Using built-in buy/sell logic.")
    BREAKOUT_STRATEGY_AVAILABLE = False

class TradingState(Enum):
    """Trading state machine states"""
    NOT_IN_TRADE = "NOT_IN_TRADE"
    IN_PROGRESS = "IN_PROGRESS"  # Passed screener, waiting for buy signal
    BOUGHT = "BOUGHT"           # Holding position

@dataclass
class Trade:
    """Trade record structure"""
    entry_date: datetime
    entry_price: float
    exit_date: Optional[datetime] = None
    exit_price: Optional[float] = None
    shares: float = 1.0
    stop_loss: Optional[float] = None
    
    @property
    def pnl(self) -> float:
        """Calculate profit/loss"""
        if self.exit_price is None:
            return 0.0
        return (self.exit_price - self.entry_price) * self.shares
    
    @property
    def pnl_percent(self) -> float:
        """Calculate percentage profit/loss"""
        if self.exit_price is None:
            return 0.0
        return ((self.exit_price - self.entry_price) / self.entry_price) * 100
    
    @property
    def holding_days(self) -> int:
        """Calculate holding period in days"""
        if self.exit_date is None:
            return 0
        return (self.exit_date - self.entry_date).days

@dataclass
class BacktestState:
    """Current backtest state"""
    current_state: TradingState = TradingState.NOT_IN_TRADE
    current_trade: Optional[Trade] = None
    screener_passed_date: Optional[datetime] = None
    consolidation_high: Optional[float] = None
    momentum_periods: List[Tuple[datetime, datetime]] = None
    consolidation_periods: List[Tuple[datetime, datetime]] = None
    
    def __post_init__(self):
        if self.momentum_periods is None:
            self.momentum_periods = []
        if self.consolidation_periods is None:
            self.consolidation_periods = []

class MomentumBacktester:
    """
    Main backtesting engine for momentum screener strategy
    """
    
    def __init__(self, ticker: str, period: str = "1y", initial_capital: float = 10000.0):
        self.ticker = ticker.upper()
        self.period = period
        self.initial_capital = initial_capital
        
        # Trading state
        self.state = BacktestState()
        self.completed_trades: List[Trade] = []
        
        # Data storage
        self.daily_data: Optional[pd.DataFrame] = None
        self.intraday_data: Optional[pd.DataFrame] = None
        
        # Tracking for visualization
        self.daily_states: List[Tuple[datetime, TradingState]] = []
        self.buy_signals: List[Tuple[datetime, float]] = []
        self.sell_signals: List[Tuple[datetime, float]] = []
        
        print(f"Initialized MomentumBacktester for {self.ticker}")
    
    def fetch_data(self) -> bool:
        """
        Fetch historical data for backtesting
        
        Returns:
            bool: True if data fetched successfully
        """
        try:
            print(f"Fetching {self.period} of data for {self.ticker}...")
            
            # Fetch daily data for the specified period
            ticker = yf.Ticker(self.ticker)
            self.daily_data = ticker.history(period=self.period)
            
            if self.daily_data.empty:
                print(f"No data available for {self.ticker}")
                return False
            
            if len(self.daily_data) < 100:
                print(f"Insufficient data for {self.ticker}: {len(self.daily_data)} days")
                return False
                
            # Calculate technical indicators
            self.daily_data = calculate_moving_averages(self.daily_data)
            self.daily_data['ATR'] = calculate_atr(self.daily_data)
            self.daily_data['daily_range_pct'] = (self.daily_data['High'] - self.daily_data['Low']) / self.daily_data['Open'] * 100
            self.daily_data['ADR_20'] = self.daily_data['daily_range_pct'].rolling(window=20).mean()
            self.daily_data['volume_sma'] = self.daily_data['Volume'].rolling(window=50).mean()
            
            print(f"Successfully fetched {len(self.daily_data)} days of data")
            print(f"Date range: {self.daily_data.index[0].date()} to {self.daily_data.index[-1].date()}")
            
            return True
            
        except Exception as e:
            print(f"Error fetching data for {self.ticker}: {e}")
            return False
    
    def run_momentum_screener(self, current_date: datetime, lookback_days: int = 100) -> Tuple[bool, Dict]:
        """
        Run momentum screener on data up to current_date
        
        Args:
            current_date: Current simulation date
            lookback_days: Days of historical data to use for screening
            
        Returns:
            tuple: (pattern_found, criteria_details)
        """
        try:
            # Get data up to current date
            historical_data = self.daily_data[self.daily_data.index <= current_date]
            
            if len(historical_data) < 50:
                return False, {}
            
            # Use the last lookback_days of data for screening
            screening_data = historical_data.tail(lookback_days).copy()
            
            # Run momentum pattern analysis
            pattern_found, criteria_details, confidence_score = check_momentum_pattern(
                screening_data, self.ticker
            )
            
            return pattern_found, criteria_details
            
        except Exception as e:
            print(f"Error running screener on {current_date.date()}: {e}")
            return False, {}
    
    def check_buy_signal(self, current_date: datetime) -> Tuple[bool, Optional[float], Optional[float]]:
        """
        Check for buy signal based on breakout strategy logic
        
        Args:
            current_date: Current simulation date
            
        Returns:
            tuple: (buy_signal, entry_price, stop_loss)
        """
        try:
            # Get current day's data
            current_data = self.daily_data[self.daily_data.index <= current_date]
            if len(current_data) < 2:
                return False, None, None
            
            current_candle = current_data.iloc[-1]
            prev_candle = current_data.iloc[-2]
            
            # Breakout signal: today's close > yesterday's high
            if current_candle['Close'] > prev_candle['High']:
                # Additional volume confirmation
                avg_volume = current_data['Volume'].rolling(window=20).mean().iloc[-1]
                if current_candle['Volume'] > avg_volume * 1.2:  # 20% above average volume
                    
                    entry_price = current_candle['Close']
                    
                    # Calculate stop loss (low of the day or previous day's low)
                    stop_loss = min(current_candle['Low'], prev_candle['Low'])
                    
                    # Risk management: ensure reasonable risk/reward
                    risk_percent = ((entry_price - stop_loss) / entry_price) * 100
                    if risk_percent <= 8.0:  # Maximum 8% risk
                        return True, entry_price, stop_loss
            
            return False, None, None
            
        except Exception as e:
            print(f"Error checking buy signal on {current_date.date()}: {e}")
            return False, None, None
    
    def check_sell_signal(self, current_date: datetime, trade: Trade) -> Tuple[bool, Optional[float], str]:
        """
        Check for sell signal based on exit strategy
        
        Args:
            current_date: Current simulation date
            trade: Current trade
            
        Returns:
            tuple: (sell_signal, exit_price, exit_reason)
        """
        try:
            current_candle = self.daily_data.loc[current_date]
            
            # Stop loss hit
            if trade.stop_loss and current_candle['Low'] <= trade.stop_loss:
                return True, trade.stop_loss, "Stop Loss"
            
            # Take profit at 2:1 risk/reward
            if trade.stop_loss:
                risk = trade.entry_price - trade.stop_loss
                target_price = trade.entry_price + (risk * 2)
                if current_candle['High'] >= target_price:
                    return True, target_price, "Take Profit"
            
            # Time-based exit (hold for maximum 10 days)
            holding_days = (current_date - trade.entry_date).days
            if holding_days >= 10:
                return True, current_candle['Close'], "Time Exit"
            
            # Momentum failure: close below 10-day SMA for 2 consecutive days
            current_data = self.daily_data[self.daily_data.index <= current_date]
            if len(current_data) >= 2:
                sma10 = current_data['SMA10'].iloc[-1]
                prev_sma10 = current_data['SMA10'].iloc[-2]
                
                if (current_candle['Close'] < sma10 and 
                    current_data.iloc[-2]['Close'] < prev_sma10):
                    return True, current_candle['Close'], "Momentum Failure"
            
            return False, None, ""
            
        except Exception as e:
            print(f"Error checking sell signal on {current_date.date()}: {e}")
            return False, None, ""
    
    def update_tracking_periods(self, current_date: datetime, criteria_details: Dict):
        """
        Update momentum and consolidation periods for visualization
        
        Args:
            current_date: Current simulation date
            criteria_details: Criteria details from screener
        """
        try:
            # Extract move boundaries if available
            criterion1 = criteria_details.get('criterion1', {})
            move_details = criterion1.get('move_details', {})
            
            if move_details and 'start_date' in move_details and 'end_date' in move_details:
                start_date = pd.to_datetime(move_details['start_date'])
                end_date = pd.to_datetime(move_details['end_date'])
                
                # Add momentum period (avoid duplicates)
                momentum_period = (start_date, end_date)
                if momentum_period not in self.state.momentum_periods:
                    self.state.momentum_periods.append(momentum_period)
                
                # Add consolidation period (from end of move to current date)
                if current_date > end_date:
                    consolidation_period = (end_date, current_date)
                    # Update or add consolidation period
                    # Remove any existing consolidation that starts on the same end_date
                    self.state.consolidation_periods = [
                        period for period in self.state.consolidation_periods 
                        if period[0] != end_date
                    ]
                    self.state.consolidation_periods.append(consolidation_period)
        
        except Exception as e:
            print(f"Error updating tracking periods: {e}")
    
    def _run_backtest_simulation(self) -> bool:
        """
        Run the complete backtest simulation
        
        Returns:
            bool: True if backtest completed successfully
        """
        if self.daily_data is None:
            print("No data available for backtesting")
            return False
        
        print(f"\nStarting backtest simulation for {self.ticker}...")
        print(f"Initial capital: ${self.initial_capital:,.2f}")
        print(f"Simulation period: {self.daily_data.index[0].date()} to {self.daily_data.index[-1].date()}")
        print("=" * 60)
        
        # Start from 50 days in to have sufficient historical data for screening
        start_idx = 50
        dates = self.daily_data.index[start_idx:]
        
        for i, current_date in enumerate(dates):
            try:
                # Log progress
                if i % 30 == 0:  # Every 30 days
                    print(f"Progress: {current_date.date()} - State: {self.state.current_state.value}")
                
                # State machine logic
                if self.state.current_state == TradingState.NOT_IN_TRADE:
                    # Run momentum screener
                    pattern_found, criteria_details = self.run_momentum_screener(current_date)
                    
                    if pattern_found:
                        # Pattern found - move to IN_PROGRESS
                        self.state.current_state = TradingState.IN_PROGRESS
                        self.state.screener_passed_date = current_date
                        
                        # Update tracking periods for visualization
                        self.update_tracking_periods(current_date, criteria_details)
                        
                        print(f"🔍 {current_date.date()}: Pattern detected - Moving to IN_PROGRESS")
                
                elif self.state.current_state == TradingState.IN_PROGRESS:
                    # Check for buy signal
                    buy_signal, entry_price, stop_loss = self.check_buy_signal(current_date)
                    
                    if buy_signal:
                        # Execute buy
                        trade = Trade(
                            entry_date=current_date,
                            entry_price=entry_price,
                            stop_loss=stop_loss
                        )
                        
                        self.state.current_trade = trade
                        self.state.current_state = TradingState.BOUGHT
                        self.buy_signals.append((current_date, entry_price))
                        
                        print(f"🚀 {current_date.date()}: BUY at ${entry_price:.2f}, Stop: ${stop_loss:.2f}")
                    
                    else:
                        # Re-check momentum criteria
                        pattern_found, _ = self.run_momentum_screener(current_date)
                        if not pattern_found:
                            # Pattern failed - return to NOT_IN_TRADE
                            self.state.current_state = TradingState.NOT_IN_TRADE
                            self.state.screener_passed_date = None
                            print(f"❌ {current_date.date()}: Pattern failed - Returning to NOT_IN_TRADE")
                
                elif self.state.current_state == TradingState.BOUGHT:
                    # Check for sell signal
                    sell_signal, exit_price, exit_reason = self.check_sell_signal(current_date, self.state.current_trade)
                    
                    if sell_signal:
                        # Execute sell
                        self.state.current_trade.exit_date = current_date
                        self.state.current_trade.exit_price = exit_price
                        
                        self.completed_trades.append(self.state.current_trade)
                        self.sell_signals.append((current_date, exit_price))
                        
                        pnl = self.state.current_trade.pnl
                        pnl_pct = self.state.current_trade.pnl_percent
                        
                        print(f"💰 {current_date.date()}: SELL at ${exit_price:.2f} ({exit_reason}) - P&L: ${pnl:.2f} ({pnl_pct:+.1f}%)")
                        
                        # Return to NOT_IN_TRADE
                        self.state.current_trade = None
                        self.state.current_state = TradingState.NOT_IN_TRADE
                        self.state.screener_passed_date = None
                
                # Track daily state for visualization
                self.daily_states.append((current_date, self.state.current_state))
                
            except Exception as e:
                print(f"Error processing {current_date.date()}: {e}")
                continue
        
        # Handle any open trade
        if self.state.current_trade and self.state.current_trade.exit_date is None:
            final_date = self.daily_data.index[-1]
            final_price = self.daily_data.iloc[-1]['Close']
            
            self.state.current_trade.exit_date = final_date
            self.state.current_trade.exit_price = final_price
            self.completed_trades.append(self.state.current_trade)
            self.sell_signals.append((final_date, final_price))
            
            print(f"💼 {final_date.date()}: Final position closed at ${final_price:.2f}")
        
        print("=" * 60)
        print("Backtest simulation completed!")
        
        return True
    
    def run_backtest(self) -> Dict[str, Any]:
        """
        Run the complete backtest simulation and return results
        
        Returns:
            dict: Backtest results with success status and data
        """
        try:
            # Run the actual backtest
            success = self._run_backtest_simulation()
            
            if not success:
                return {
                    "success": False,
                    "error": "Backtest simulation failed"
                }
            
            # Calculate performance metrics
            metrics = self.calculate_performance_metrics()
            
            # Prepare trade log
            trades = []
            for i, trade in enumerate(self.completed_trades):
                trades.append({
                    "trade_number": i + 1,
                    "entry_date": trade.entry_date.isoformat(),
                    "entry_price": round(trade.entry_price, 2),
                    "exit_date": trade.exit_date.isoformat() if trade.exit_date else None,
                    "exit_price": round(trade.exit_price, 2) if trade.exit_price else None,
                    "pnl": round(trade.pnl, 2),
                    "pnl_percent": round(trade.pnl_percent, 2),
                    "holding_days": trade.holding_days,
                    "stop_loss": round(trade.stop_loss, 2) if trade.stop_loss else None
                })
            
            # Prepare price data for chart
            price_data = []
            for date, row in self.daily_data.iterrows():
                price_data.append({
                    "date": date.isoformat(),
                    "open": round(row['Open'], 2),
                    "high": round(row['High'], 2),
                    "low": round(row['Low'], 2),
                    "close": round(row['Close'], 2),
                    "price": round(row['Close'], 2),  # Add price field for frontend compatibility
                    "volume": int(row['Volume'])
                })
            
            # Prepare momentum periods for visualization
            momentum_periods = []
            for start_date, end_date in self.state.momentum_periods:
                momentum_periods.append({
                    "start_date": start_date.isoformat(),
                    "end_date": end_date.isoformat(),
                    "type": "momentum"
                })
            
            # Prepare consolidation periods
            consolidation_periods = []
            for start_date, end_date in self.state.consolidation_periods:
                consolidation_periods.append({
                    "start_date": start_date.isoformat(),
                    "end_date": end_date.isoformat(),
                    "type": "consolidation"
                })
            
            return {
                "success": True,
                "results": metrics,
                "trades": trades,
                "price_data": price_data,
                "momentum_periods": momentum_periods + consolidation_periods,
                "buy_signals": [
                    {"date": date.isoformat(), "price": round(price, 2)}
                    for date, price in self.buy_signals
                ],
                "sell_signals": [
                    {"date": date.isoformat(), "price": round(price, 2)}
                    for date, price in self.sell_signals
                ]
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"Backtest failed: {str(e)}"
            }
    
    def _run_backtest_simulation(self) -> bool:
        """
        Run the complete backtest simulation
        
        Returns:
            bool: True if backtest completed successfully
        """
        if self.daily_data is None:
            print("No data available for backtesting")
            return False
        
        print(f"\nStarting backtest simulation for {self.ticker}...")
        print(f"Initial capital: ${self.initial_capital:,.2f}")
        print(f"Simulation period: {self.daily_data.index[0].date()} to {self.daily_data.index[-1].date()}")
        print("=" * 60)
        
        # Start from 50 days in to have sufficient historical data for screening
        start_idx = 50
        dates = self.daily_data.index[start_idx:]
        
        for i, current_date in enumerate(dates):
            try:
                # Log progress
                if i % 30 == 0:  # Every 30 days
                    print(f"Progress: {current_date.date()} - State: {self.state.current_state.value}")
                
                # State machine logic
                if self.state.current_state == TradingState.NOT_IN_TRADE:
                    # Run momentum screener
                    pattern_found, criteria_details = self.run_momentum_screener(current_date)
                    
                    if pattern_found:
                        # Pattern found - move to IN_PROGRESS
                        self.state.current_state = TradingState.IN_PROGRESS
                        self.state.screener_passed_date = current_date
                        
                        # Update tracking periods for visualization
                        self.update_tracking_periods(current_date, criteria_details)
                        
                        print(f"🔍 {current_date.date()}: Pattern detected - Moving to IN_PROGRESS")
                
                elif self.state.current_state == TradingState.IN_PROGRESS:
                    # Check for buy signal
                    buy_signal, entry_price, stop_loss = self.check_buy_signal(current_date)
                    
                    if buy_signal:
                        # Execute buy
                        trade = Trade(
                            entry_date=current_date,
                            entry_price=entry_price,
                            stop_loss=stop_loss
                        )
                        
                        self.state.current_trade = trade
                        self.state.current_state = TradingState.BOUGHT
                        self.buy_signals.append((current_date, entry_price))
                        
                        print(f"🚀 {current_date.date()}: BUY at ${entry_price:.2f}, Stop: ${stop_loss:.2f}")
                    
                    else:
                        # Re-check momentum criteria
                        pattern_found, _ = self.run_momentum_screener(current_date)
                        if not pattern_found:
                            # Pattern failed - return to NOT_IN_TRADE
                            self.state.current_state = TradingState.NOT_IN_TRADE
                            self.state.screener_passed_date = None
                            print(f"❌ {current_date.date()}: Pattern failed - Returning to NOT_IN_TRADE")
                
                elif self.state.current_state == TradingState.BOUGHT:
                    # Check for sell signal
                    sell_signal, exit_price, exit_reason = self.check_sell_signal(current_date, self.state.current_trade)
                    
                    if sell_signal:
                        # Execute sell
                        self.state.current_trade.exit_date = current_date
                        self.state.current_trade.exit_price = exit_price
                        
                        self.completed_trades.append(self.state.current_trade)
                        self.sell_signals.append((current_date, exit_price))
                        
                        pnl = self.state.current_trade.pnl
                        pnl_pct = self.state.current_trade.pnl_percent
                        
                        print(f"💰 {current_date.date()}: SELL at ${exit_price:.2f} ({exit_reason}) - P&L: ${pnl:.2f} ({pnl_pct:+.1f}%)")
                        
                        # Return to NOT_IN_TRADE
                        self.state.current_trade = None
                        self.state.current_state = TradingState.NOT_IN_TRADE
                        self.state.screener_passed_date = None
                
                # Track daily state for visualization
                self.daily_states.append((current_date, self.state.current_state))
                
            except Exception as e:
                print(f"Error processing {current_date.date()}: {e}")
                continue
        
        # Handle any open trade
        if self.state.current_trade and self.state.current_trade.exit_date is None:
            final_date = self.daily_data.index[-1]
            final_price = self.daily_data.iloc[-1]['Close']
            
            self.state.current_trade.exit_date = final_date
            self.state.current_trade.exit_price = final_price
            self.completed_trades.append(self.state.current_trade)
            self.sell_signals.append((final_date, final_price))
            
            print(f"💼 {final_date.date()}: Final position closed at ${final_price:.2f}")
        
        print("=" * 60)
        print("Backtest simulation completed!")
        
        return True
    
    def calculate_performance_metrics(self) -> Dict[str, Any]:
        """
        Calculate comprehensive performance metrics
        
        Returns:
            dict: Performance metrics
        """
        if not self.completed_trades:
            return {
                'total_trades': 0,
                'win_rate': 0,
                'total_pnl': 0,
                'total_return_pct': 0,
                'avg_trade_pnl': 0,
                'avg_holding_days': 0,
                'max_drawdown': 0,
                'sharpe_ratio': 0
            }
        
        # Basic metrics
        total_trades = len(self.completed_trades)
        winning_trades = [t for t in self.completed_trades if t.pnl > 0]
        losing_trades = [t for t in self.completed_trades if t.pnl <= 0]
        
        win_rate = len(winning_trades) / total_trades if total_trades > 0 else 0
        total_pnl = sum(t.pnl for t in self.completed_trades)
        total_return_pct = (total_pnl / self.initial_capital) * 100
        avg_trade_pnl = total_pnl / total_trades if total_trades > 0 else 0
        avg_holding_days = sum(t.holding_days for t in self.completed_trades) / total_trades if total_trades > 0 else 0
        
        # Max drawdown calculation
        equity_curve = [self.initial_capital]
        for trade in self.completed_trades:
            equity_curve.append(equity_curve[-1] + trade.pnl)
        
        running_max = [equity_curve[0]]
        for val in equity_curve[1:]:
            running_max.append(max(running_max[-1], val))
        
        drawdowns = [(equity_curve[i] - running_max[i]) / running_max[i] * 100 for i in range(len(equity_curve))]
        max_drawdown = min(drawdowns) if drawdowns else 0
        
        # Sharpe ratio (simplified)
        if total_trades > 1:
            returns = [t.pnl_percent for t in self.completed_trades]
            avg_return = np.mean(returns)
            std_return = np.std(returns)
            sharpe_ratio = avg_return / std_return if std_return > 0 else 0
        else:
            sharpe_ratio = 0
        
        return {
            'total_trades': total_trades,
            'winning_trades': len(winning_trades),
            'losing_trades': len(losing_trades),
            'win_rate': win_rate,
            'total_pnl': total_pnl,
            'total_return_pct': total_return_pct,
            'avg_trade_pnl': avg_trade_pnl,
            'avg_win': np.mean([t.pnl for t in winning_trades]) if winning_trades else 0,
            'avg_loss': np.mean([t.pnl for t in losing_trades]) if losing_trades else 0,
            'avg_holding_days': avg_holding_days,
            'max_drawdown': max_drawdown,
            'sharpe_ratio': sharpe_ratio,
            'equity_curve': equity_curve
        }
    
    def print_performance_summary(self):
        """Print comprehensive performance summary"""
        metrics = self.calculate_performance_metrics()
        
        print("\n" + "=" * 60)
        print(f"PERFORMANCE SUMMARY - {self.ticker}")
        print("=" * 60)
        
        print(f"📊 Trading Statistics:")
        print(f"   Total Trades: {metrics['total_trades']}")
        print(f"   Winning Trades: {metrics['winning_trades']}")
        print(f"   Losing Trades: {metrics['losing_trades']}")
        print(f"   Win Rate: {metrics['win_rate']:.1%}")
        print(f"   Average Holding Period: {metrics['avg_holding_days']:.1f} days")
        
        print(f"\n💰 Financial Performance:")
        print(f"   Total P&L: ${metrics['total_pnl']:,.2f}")
        print(f"   Total Return: {metrics['total_return_pct']:+.2f}%")
        print(f"   Average Trade P&L: ${metrics['avg_trade_pnl']:,.2f}")
        print(f"   Average Win: ${metrics['avg_win']:,.2f}")
        print(f"   Average Loss: ${metrics['avg_loss']:,.2f}")
        
        print(f"\n📈 Risk Metrics:")
        print(f"   Max Drawdown: {metrics['max_drawdown']:-.2f}%")
        print(f"   Sharpe Ratio: {metrics['sharpe_ratio']:.2f}")
        
        print(f"\n📋 Trade Log:")
        for i, trade in enumerate(self.completed_trades, 1):
            print(f"   {i:2d}. {trade.entry_date.date()} to {trade.exit_date.date()}: "
                  f"${trade.entry_price:.2f} → ${trade.exit_price:.2f} = "
                  f"${trade.pnl:+.2f} ({trade.pnl_percent:+.1f}%) [{trade.holding_days}d]")
    
    def generate_chart(self, show_chart: bool = True, save_chart: bool = False) -> str:
        """
        Generate chart visualization
        
        Args:
            show_chart: Whether to display the chart
            save_chart: Whether to save the chart to file
            
        Returns:
            str: Path to saved chart or empty string
        """
        try:
            # Create the visualization
            self.create_visualization()
            
            if save_chart:
                chart_path = f"backtest_chart_{self.ticker}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
                plt.savefig(chart_path, dpi=300, bbox_inches='tight')
                return chart_path
            
            return ""
            
        except Exception as e:
            print(f"Error generating chart: {e}")
            return ""
    
    def create_visualization(self):
        """
        Create comprehensive visualization with highlighted periods and trades
        """
        fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(16, 12), height_ratios=[3, 1])
        
        # Prepare data
        dates = self.daily_data.index
        
        # Plot price chart
        ax1.plot(dates, self.daily_data['Close'], color='black', linewidth=1, label='Close Price', alpha=0.8)
        ax1.plot(dates, self.daily_data['SMA10'], color='blue', linewidth=1, label='SMA10', alpha=0.7)
        ax1.plot(dates, self.daily_data['SMA20'], color='orange', linewidth=1, label='SMA20', alpha=0.7)
        ax1.plot(dates, self.daily_data['SMA50'], color='red', linewidth=1.5, label='SMA50', alpha=0.7)
        
        # Highlight momentum periods (light green)
        for start_date, end_date in self.state.momentum_periods:
            ax1.axvspan(start_date, end_date, alpha=0.3, color='lightgreen', label='Momentum Move' if start_date == self.state.momentum_periods[0][0] else "")
        
        # Highlight consolidation periods (light yellow)
        for start_date, end_date in self.state.consolidation_periods:
            ax1.axvspan(start_date, end_date, alpha=0.3, color='lightyellow', label='Consolidation' if start_date == self.state.consolidation_periods[0][0] else "")
        
        # Mark buy signals (green upward arrows)
        if self.buy_signals:
            buy_dates, buy_prices = zip(*self.buy_signals)
            ax1.scatter(buy_dates, buy_prices, marker='^', color='green', s=100, zorder=5, label='Buy Signal')
        
        # Mark sell signals (red downward arrows)
        if self.sell_signals:
            sell_dates, sell_prices = zip(*self.sell_signals)
            ax1.scatter(sell_dates, sell_prices, marker='v', color='red', s=100, zorder=5, label='Sell Signal')
        
        # Format price chart
        ax1.set_title(f'{self.ticker} - Momentum Strategy Backtest Results', fontsize=16, fontweight='bold')
        ax1.set_ylabel('Price ($)', fontsize=12)
        ax1.grid(True, alpha=0.3)
        ax1.legend(loc='upper left')
        
        # Format dates
        ax1.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m'))
        ax1.xaxis.set_major_locator(mdates.MonthLocator(interval=2))
        
        # Plot volume
        colors = ['green' if close >= open else 'red' for close, open in zip(self.daily_data['Close'], self.daily_data['Open'])]
        ax2.bar(dates, self.daily_data['Volume'], color=colors, alpha=0.6, width=1)
        ax2.set_ylabel('Volume', fontsize=12)
        ax2.grid(True, alpha=0.3)
        
        # Format dates for volume chart
        ax2.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m'))
        ax2.xaxis.set_major_locator(mdates.MonthLocator(interval=2))
        
        plt.xticks(rotation=45)
        plt.tight_layout()
        
        # Add performance text box
        metrics = self.calculate_performance_metrics()
        textstr = f"""Performance Summary:
Total Trades: {metrics['total_trades']}
Win Rate: {metrics['win_rate']:.1%}
Total Return: {metrics['total_return_pct']:+.2f}%
Max Drawdown: {metrics['max_drawdown']:-.2f}%
Sharpe Ratio: {metrics['sharpe_ratio']:.2f}"""
        
        props = dict(boxstyle='round', facecolor='wheat', alpha=0.8)
        ax1.text(0.02, 0.98, textstr, transform=ax1.transAxes, fontsize=10,
                verticalalignment='top', bbox=props)
        
        plt.show()
        
        # Save the chart
        filename = f"{self.ticker}_backtest_results.png"
        plt.savefig(filename, dpi=300, bbox_inches='tight')
        print(f"\nChart saved as: {filename}")

def main():
    """Main execution function with command line interface"""
    parser = argparse.ArgumentParser(description='Momentum Screener Backtest Engine')
    parser.add_argument('--ticker', '-t', required=True, help='Stock ticker symbol (e.g., ALAB)')
    parser.add_argument('--period', '-p', default='1y', 
                       choices=['6mo', '1y', '2y', '5y'],
                       help='Historical data period (default: 1y)')
    parser.add_argument('--capital', '-c', type=float, default=10000.0,
                       help='Initial capital (default: $10,000)')
    parser.add_argument('--save-chart', '-s', action='store_true',
                       help='Save chart to file')
    
    args = parser.parse_args()
    
    print("🚀 Momentum Screener Backtest Engine")
    print("=" * 50)
    
    # Initialize backtester
    backtester = MomentumBacktester(
        ticker=args.ticker,
        period=args.period,
        initial_capital=args.capital
    )
    
    # Fetch data
    if not backtester.fetch_data():
        print("❌ Failed to fetch data. Exiting.")
        return
    
    # Run backtest
    if not backtester.run_backtest():
        print("❌ Backtest failed. Exiting.")
        return
    
    # Print results
    backtester.print_performance_summary()
    
    # Create visualization
    print("\n📊 Generating visualization...")
    backtester.create_visualization()
    
    print(f"\n✅ Backtest completed successfully for {args.ticker}!")

if __name__ == "__main__":
    main()