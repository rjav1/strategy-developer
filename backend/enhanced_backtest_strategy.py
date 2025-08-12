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
import asyncio
warnings.filterwarnings('ignore')

# Import logging manager
from logging_manager import logging_manager, log_info, log_warn, log_error, log_debug

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
    """Fetch OHLCV data using yfinance with enhanced data preparation and timeout protection"""
    import concurrent.futures
    
    def _fetch_data_inner():
        """Inner function to fetch data with timeout protection"""
        try:
            print(f"🔍 DEBUG fetch_ohlcv: symbol={symbol}, period_str={period_str}")
            
            print(f"🔧 DEBUG fetch_ohlcv: Creating yf.Ticker({symbol})")
            ticker = yf.Ticker(symbol)
            
            print(f"🔧 DEBUG fetch_ohlcv: Calling ticker.history(period={period_str}, timeout=15)")
            # Add timeout parameter to prevent hanging
            data = ticker.history(period=period_str, timeout=15)
            
            print(f"🔧 DEBUG fetch_ohlcv: Raw data shape: {data.shape if not data.empty else 'EMPTY'}")
            
            if data.empty:
                print(f"❌ DEBUG fetch_ohlcv: Data is empty, returning empty DataFrame")
                return pd.DataFrame()
            
            print(f"🔧 DEBUG fetch_ohlcv: Raw data columns: {list(data.columns)}")
            print(f"🔧 DEBUG fetch_ohlcv: Raw data date range: {data.index[0]} to {data.index[-1]}")
            
            # Prepare data with all required fields for momentum screening
            print(f"🔧 DEBUG fetch_ohlcv: Preparing enhanced data...")
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
            
            print(f"✅ DEBUG fetch_ohlcv: Successfully prepared {len(data)} rows with {len(data.columns)} columns")
            print(f"🔧 DEBUG fetch_ohlcv: Final columns: {list(data.columns)}")
            
            return data
            
        except Exception as e:
            print(f"❌ DEBUG fetch_ohlcv: Inner exception for {symbol}: {type(e).__name__}: {str(e)}")
            import traceback
            print(f"❌ DEBUG fetch_ohlcv: Full traceback: {traceback.format_exc()}")
            return pd.DataFrame()
    
    try:
        # Execute with ThreadPoolExecutor timeout to prevent hanging
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(_fetch_data_inner)
            try:
                # Wait max 25 seconds for data fetch and processing
                result = future.result(timeout=25)
                return result
            except concurrent.futures.TimeoutError:
                print(f"⏰ DEBUG fetch_ohlcv: Timeout fetching data for {symbol} after 25 seconds")
                return pd.DataFrame()
        
    except Exception as e:
        print(f"❌ DEBUG fetch_ohlcv: Outer exception for {symbol}: {type(e).__name__}: {str(e)}")
        import traceback
        print(f"❌ DEBUG fetch_ohlcv: Full traceback: {traceback.format_exc()}")
        return pd.DataFrame()

# Define data structures for trade tracking and state management

class TradingState(Enum):
    """Enhanced trading state machine states"""
    NOT_IN_TRADE = "NOT_IN_TRADE"          # No pattern detected - no background
    MOMENTUM_DETECTED = "MOMENTUM"          # Move up detected - red background
    CONSOLIDATION = "CONSOLIDATION"         # Consolidation after move - yellow background  
    IN_POSITION = "IN_POSITION"            # Holding position after breakout - green background

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
    # Risk fields for UI
    risk_amount: float = 0.0
    risk_percentage: float = 0.0
    risk_per_share: float = 0.0
    # Grouping identifier for an entire position (entries + trims + final exit)
    trade_id: int = 0
    
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
            'max_loss': round(self.max_loss, 2),
            'risk_amount': round(self.risk_amount, 2),
            'risk_percentage': round(self.risk_percentage, 2),
            'risk_per_share': round(self.risk_per_share, 4),
            'trade_id': self.trade_id
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
        self.breakout_day_low: float = 0.0  # Store breakout day low for exit calculation
        
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
        
        # Progressive trim/stop tracking
        self.initial_risk_per_share: float = 0.0
        self.next_trim_multiple: float = 2.0  # 2R to start, then doubles each trim
        self.enable_progressive_trims: bool = True
        
        # Store entry rows for UI Trade Log (non-PnL informational rows)
        self.entry_events: List[Dict[str, Any]] = []
        
        # Unique trade identifier sequence
        self.trade_seq: int = 0
        
        log_info(f"Enhanced MomentumBacktester initialized for {self.ticker}", {"ticker": self.ticker}, "backtest")
    
    async def fetch_data(self) -> bool:
        """Fetch and prepare data for backtesting"""
        try:
            print(f"🔍 DEBUG EnhancedMomentumBacktester.fetch_data: Starting for {self.ticker} ({self.period})")
            log_info(f"Fetching data for {self.ticker} ({self.period})", {"ticker": self.ticker, "period": self.period}, "backtest")
            await asyncio.sleep(0)  # Yield control to event loop
            
            print(f"🔧 DEBUG EnhancedMomentumBacktester.fetch_data: About to call fetch_ohlcv({self.ticker}, {self.period})")
            self.daily_data = fetch_ohlcv(self.ticker, self.period)
            print(f"🔧 DEBUG EnhancedMomentumBacktester.fetch_data: fetch_ohlcv returned data with type {type(self.daily_data)}")
            
            if self.daily_data is None:
                print(f"❌ DEBUG EnhancedMomentumBacktester.fetch_data: daily_data is None")
                log_error(f"daily_data is None", {"ticker": self.ticker}, "backtest")
                return False
            elif isinstance(self.daily_data, pd.DataFrame) and self.daily_data.empty:
                print(f"❌ DEBUG EnhancedMomentumBacktester.fetch_data: daily_data is empty DataFrame")
                log_error(f"daily_data is empty DataFrame", {"ticker": self.ticker}, "backtest")
                return False
            else:
                min_required_days = 60  # Need enough for SMA50/ADR20 + simulation start at 50
                if len(self.daily_data) < min_required_days:
                    print(f"❌ DEBUG EnhancedMomentumBacktester.fetch_data: Insufficient data: {len(self.daily_data)} days (need {min_required_days}+)\n"
                          f"Tip: Increase period or lower this threshold if needed.")
                    log_error(
                        f"Insufficient data: have {len(self.daily_data)} days; need {min_required_days}+",
                        {"ticker": self.ticker, "have_days": len(self.daily_data), "need_days": min_required_days},
                        "backtest"
                    )
                    return False
            
            print(f"✅ DEBUG EnhancedMomentumBacktester.fetch_data: Successfully got {len(self.daily_data)} days of data")
            log_info(f"Fetched {len(self.daily_data)} days of data", {"ticker": self.ticker, "days": len(self.daily_data)}, "backtest")
            await asyncio.sleep(0)  # Yield control to event loop
            
            print(f"🔧 DEBUG EnhancedMomentumBacktester.fetch_data: Date range: {self.daily_data.index[0].date()} to {self.daily_data.index[-1].date()}")
            log_info(f"Date range: {self.daily_data.index[0].date()} to {self.daily_data.index[-1].date()}", {
                "ticker": self.ticker,
                "start_date": self.daily_data.index[0].date().isoformat(),
                "end_date": self.daily_data.index[-1].date().isoformat()
            }, "backtest")
            await asyncio.sleep(0)  # Yield control to event loop
            return True
            
        except Exception as e:
            print(f"❌ DEBUG EnhancedMomentumBacktester.fetch_data: Exception: {type(e).__name__}: {str(e)}")
            import traceback
            print(f"❌ DEBUG EnhancedMomentumBacktester.fetch_data: Full traceback: {traceback.format_exc()}")
            log_error(f"Error fetching data: {e}", {"ticker": self.ticker, "error": str(e)}, "backtest")
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
                                    details=consolidation_details
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
    
    def check_buy_signal(self, current_date: datetime, current_row: pd.Series, consolidation_high: float = None) -> bool:
        """Check for buy signal when in CONSOLIDATION state - breakout above consolidation range with volume + additional criteria"""
        if self.state != TradingState.CONSOLIDATION:
            return False
        
        current_close = current_row['Close']  # Use CLOSE instead of HIGH for breakout
        current_volume = current_row['Volume']
        current_idx = self.daily_data.index.get_loc(current_date)
        
        # ADDITIONAL CRITERIA: Check 50-day moving average and ADR range
        # These are the same criteria used in the screener that we want to enforce in the backtester
        
        # Criterion 1: Current price above 50-day moving average
        sma50 = self.daily_data.iloc[current_idx]['SMA50'] if 'SMA50' in self.daily_data.columns else None
        if sma50 is None or pd.isna(sma50):
            log_warn(f"❌ No SMA50 available for {current_date.date()}", {
                "ticker": self.ticker,
                "date": current_date.date().isoformat()
            }, "backtest")
            return False
        
        price_above_sma50 = current_close > sma50
        if not price_above_sma50:
            log_info(f"❌ Price ${current_close:.2f} below 50-day SMA ${sma50:.2f} on {current_date.date()}", {
                "ticker": self.ticker,
                "current_close": current_close,
                "sma50": sma50,
                "date": current_date.date().isoformat()
            }, "backtest")
            return False
        
        # Criterion 2: ADR range between 3-20%
        current_adr = self.daily_data.iloc[current_idx]['ADR_20'] if 'ADR_20' in self.daily_data.columns else None
        if current_adr is None or pd.isna(current_adr):
            log_warn(f"❌ No ADR_20 available for {current_date.date()}", {
                "ticker": self.ticker,
                "date": current_date.date().isoformat()
            }, "backtest")
            return False
        
        adr_in_range = 3.0 <= current_adr <= 20.0
        if not adr_in_range:
            log_info(f"❌ ADR {current_adr:.1f}% outside range (3-20%) on {current_date.date()}", {
                "ticker": self.ticker,
                "current_adr": current_adr,
                "min_adr": 3.0,
                "max_adr": 20.0,
                "date": current_date.date().isoformat()
            }, "backtest")
            return False
        
        log_info(f"✅ Additional criteria PASSED: Price ${current_close:.2f} > SMA50 ${sma50:.2f}, ADR {current_adr:.1f}% in range (3-20%)", {
            "ticker": self.ticker,
            "current_close": current_close,
            "sma50": sma50,
            "current_adr": current_adr,
            "date": current_date.date().isoformat()
        }, "backtest")
        
        # Get consolidation high from momentum screener results (EXCLUDING current day)
        if consolidation_high is None:
            # Use the screener's consolidation detection to get the range, but exclude current day
            lookback_data = self.daily_data.iloc[:current_idx]  # EXCLUDE current day
            try:
                # Run screener on previous day's data to get consolidation range
                prev_date = self.daily_data.index[current_idx-1] if current_idx > 0 else current_date
                pattern_found, criteria_details, confidence = self.run_daily_screener(prev_date, lookback_data)
                if criteria_details and 'criterion2_3' in criteria_details:
                    consol_details = criteria_details['criterion2_3']
                    consol_start_idx = consol_details.get('consolidation_start_idx', -1)
                    consol_end_idx = consol_details.get('consolidation_end_idx', -1)
                    
                    if consol_start_idx >= 0 and consol_end_idx >= 0:
                        # Get consolidation data (excluding current day)
                        consol_data = lookback_data.iloc[consol_start_idx:consol_end_idx+1]
                        consolidation_high = consol_data['High'].max()
                        consolidation_low = consol_data['Low'].min()
                        log_info(f"🔍 Consolidation range (excluding today): {consolidation_low:.2f} - {consolidation_high:.2f}", {
                            "ticker": self.ticker,
                            "consolidation_low": consolidation_low,
                            "consolidation_high": consolidation_high,
                            "consol_start_idx": consol_start_idx,
                            "consol_end_idx": consol_end_idx,
                            "date": current_date.date().isoformat()
                        }, "backtest")
            except Exception as e:
                log_warn(f"⚠️ Error getting consolidation high: {e}", {
                    "ticker": self.ticker,
                    "error": str(e)
                }, "backtest")
                return False
        
        if consolidation_high is None:
            log_warn(f"❌ No consolidation high found for {current_date.date()}", {
                "ticker": self.ticker,
                "date": current_date.date().isoformat()
            }, "backtest")
            return False
        
        # Calculate 20-day average volume
        avg_volume_20 = self.daily_data.iloc[max(0, current_idx-20):current_idx]['Volume'].mean()
        
        # Entry conditions: CLOSE above consolidation high + volume above 20-day average
        breakout = current_close > consolidation_high
        volume_confirmation = current_volume > avg_volume_20
        
        log_info(f"🎯 Buy Signal Check {current_date.date()}: Close={current_close:.2f} vs Consol={consolidation_high:.2f}, Vol={current_volume:.0f} vs Avg={avg_volume_20:.0f}", {
            "ticker": self.ticker,
            "current_close": current_close,
            "consolidation_high": consolidation_high,
            "current_volume": current_volume,
            "avg_volume_20": avg_volume_20,
            "breakout": breakout,
            "volume_confirmation": volume_confirmation,
            "date": current_date.date().isoformat()
        }, "backtest")
        log_info(f"   Breakout: {breakout}, Volume OK: {volume_confirmation}", {
            "ticker": self.ticker,
            "is_breakout": breakout,
            "has_volume": volume_confirmation,
            "date": current_date.date().isoformat()
        }, "backtest")
        
        # ALL criteria must be met: price above SMA50 + ADR in range + breakout + volume
        all_criteria_met = price_above_sma50 and adr_in_range and breakout and volume_confirmation
        
        if all_criteria_met:
            log_info(f"🟢 ALL CRITERIA PASSED: Buy signal confirmed for {current_date.date()}", {
                "ticker": self.ticker,
                "price_above_sma50": price_above_sma50,
                "adr_in_range": adr_in_range,
                "breakout": breakout,
                "volume_confirmation": volume_confirmation,
                "date": current_date.date().isoformat()
            }, "backtest")
        else:
            log_info(f"❌ CRITERIA FAILED: Buy signal rejected for {current_date.date()}", {
                "ticker": self.ticker,
                "price_above_sma50": price_above_sma50,
                "adr_in_range": adr_in_range,
                "breakout": breakout,
                "volume_confirmation": volume_confirmation,
                "date": current_date.date().isoformat()
            }, "backtest")
        
        return all_criteria_met
    
    def check_sell_signal(self, current_date: datetime, current_row: pd.Series) -> Tuple[bool, str]:
        """Check for sell signal when in IN_POSITION state - close below dynamic stop OR 20-day SMA (whichever higher)"""
        if self.state != TradingState.IN_POSITION or self.current_trade is None:
            return False, ""
        
        current_close = current_row['Close']
        
        # Use dynamic stop (initially breakout day low; later may be raised to breakeven)
        dynamic_stop = self.current_trade.stop_loss if self.current_trade.stop_loss is not None else self.breakout_day_low
        
        # Get 20-day SMA
        current_idx = self.daily_data.index.get_loc(current_date)
        sma_20 = self.daily_data.iloc[current_idx]['SMA20'] if 'SMA20' in self.daily_data.columns else 0
        
        # Exit level is the higher of: dynamic stop OR 20-day SMA
        if not pd.isna(sma_20) and sma_20 > 0:
            exit_level = max(dynamic_stop, sma_20)
            reason = "Below Dynamic Stop" if exit_level == dynamic_stop else "Below 20-day SMA"
        else:
            exit_level = dynamic_stop
            reason = "Below Dynamic Stop"
        
        # Sell if close below exit level
        if current_close < exit_level:
            return True, reason
        
        return False, ""
    
    def execute_buy(self, current_date: datetime, current_row: pd.Series) -> MarketEvent:
        """Execute buy order at close of breakout day with 1% risk-based position sizing"""
        buy_price = current_row['Close']  # Execute at close of breakout day
        
        # Store breakout day low for exit calculation (this is our initial stop loss)
        self.breakout_day_low = current_row['Low']
        initial_stop_loss = self.breakout_day_low
        
        # Calculate 1% risk-based position sizing
        # Formula: (entry_price - stop_loss) × shares_to_buy = portfolio_size × 0.01
        # Rearranged: shares_to_buy = (portfolio_size × 0.01) / (entry_price - stop_loss)
        portfolio_value = self.current_capital
        max_risk_amount = portfolio_value * 0.01  # 1% of portfolio
        risk_per_share = buy_price - initial_stop_loss
        
        if risk_per_share <= 0:
            # If stop loss is above or equal to entry price, use minimum position
            log_warn(f"⚠️ Invalid risk calculation: entry=${buy_price:.2f}, stop=${initial_stop_loss:.2f}", {
                "ticker": self.ticker,
                "entry_price": buy_price,
                "stop_loss": initial_stop_loss,
                "date": current_date.date().isoformat()
            }, "backtest")
            shares = int(max_risk_amount / buy_price)  # Fallback to small position
        else:
            shares = int(max_risk_amount / risk_per_share)
        
        # Ensure we don't exceed available capital
        max_affordable_shares = int(self.current_capital * 0.95 / buy_price)
        shares = min(shares, max_affordable_shares)
        
        # Ensure minimum position of at least 1 share
        shares = max(1, shares)
        
        # Risk fields
        actual_risk_amount = max_risk_amount if risk_per_share > 0 else shares * (buy_price * 0.01)
        risk_percentage = (actual_risk_amount / portfolio_value) * 100 if portfolio_value > 0 else 0.0
        
        self.current_trade = Trade(
            entry_date=current_date,
            entry_price=buy_price,
            entry_reason="Momentum Breakout",
            shares=shares,
            stop_loss=initial_stop_loss,  # Use breakout day low as stop loss
            target_price=buy_price * 1.04,
            risk_amount=actual_risk_amount,
            risk_percentage=risk_percentage,
            risk_per_share=max(0.0, risk_per_share),
            trade_id=0
        )
        
        # Initialize progressive trim tracking
        self.initial_risk_per_share = max(0.0, risk_per_share)
        self.next_trim_multiple = 2.0
        
        self.current_capital -= shares * buy_price
        self.state = TradingState.IN_POSITION
        
        # Assign a new trade_id for this position
        self.trade_seq += 1
        self.current_trade.trade_id = self.trade_seq
        
        event = MarketEvent(
            date=current_date,
            event_type='buy',
            price=buy_price,
            volume=int(current_row['Volume']),
            details={
                'shares': shares,
                'cost_basis': shares * buy_price,
                'stop_loss': self.current_trade.stop_loss,
                'target_price': self.current_trade.target_price,
                'risk_amount': actual_risk_amount,
                'risk_percentage': risk_percentage,
                'risk_per_share': risk_per_share,
                'portfolio_value': portfolio_value,
                'capital_after': self.current_capital
            }
        )
        
        # Add an entry row for UI Trade Log
        self.entry_events.append({
            'type': 'entry',
            'entry_date': current_date.isoformat(),
            'entry_price': buy_price,
            'shares': shares,
            'stop_loss': initial_stop_loss,
            'risk_amount': round(actual_risk_amount, 2),
            'risk_percentage': round(risk_percentage, 2),
            'risk_per_share': round(max(0.0, risk_per_share), 4),
            'status': 'closed',
            'entry_reason': 'Buy'
        })
        
        log_info(f"🟢 BUY: {shares} shares of {self.ticker} at ${buy_price:.2f} on {current_date.date()}", {
            "ticker": self.ticker,
            "action": "BUY",
            "shares": shares,
            "price": buy_price,
            "stop_loss": initial_stop_loss,
            "risk_per_share": risk_per_share,
            "risk_amount": actual_risk_amount,
            "risk_percentage": risk_percentage,
            "portfolio_value": portfolio_value,
            "capital_after": self.current_capital,
            "date": current_date.date().isoformat()
        }, "backtest")
        
        log_info(f"   Position Sizing: Risk ${actual_risk_amount:.2f} ({risk_percentage:.2f}%) | Stop: ${initial_stop_loss:.2f} | Risk/Share: ${risk_per_share:.2f}", {
            "ticker": self.ticker,
            "actual_risk_amount": actual_risk_amount,
            "risk_percentage": risk_percentage,
            "stop_loss": initial_stop_loss,
            "risk_per_share": risk_per_share,
            "date": current_date.date().isoformat()
        }, "backtest")
        return event
    
    def execute_sell(self, current_date: datetime, current_row: pd.Series, reason: str, price_override: float | None = None) -> MarketEvent:
        """Execute sell order (supports optional price override for stop executions)"""
        if self.current_trade is None:
            raise ValueError("No current trade to sell")
        
        sell_price = price_override if price_override is not None else current_row['Close']
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
                'reason': reason,
                'capital_after': self.current_capital
            }
        )
        
        log_info(f"🔴 SELL: {shares} shares of {self.ticker} at ${sell_price:.2f} on {current_date.date()} ({reason}) - P&L: ${trade_to_complete.pnl:.2f}", {
            "ticker": self.ticker,
            "action": "SELL",
            "shares": shares,
            "price": sell_price,
            "reason": reason,
            "pnl": trade_to_complete.pnl,
            "capital_after": self.current_capital,
            "date": current_date.date().isoformat()
        }, "backtest")
        return event

    def execute_partial_sell(self, current_date: datetime, current_row: pd.Series, shares_to_sell: int, reason: str) -> MarketEvent:
        """Trim part of the current position without closing the trade."""
        if self.current_trade is None or shares_to_sell <= 0:
            raise ValueError("No current trade to trim or invalid share size")
        
        shares_to_sell = min(shares_to_sell, self.current_trade.shares)
        sell_price = current_row['High'] if current_row['High'] > current_row['Close'] else current_row['Close']
        proceeds = shares_to_sell * sell_price
        
        # Record a completed trade slice for the trim so it shows in the trade log and stats
        trim_trade = Trade(
            entry_date=self.current_trade.entry_date,
            entry_price=self.current_trade.entry_price,
            entry_reason=self.current_trade.entry_reason,
            exit_date=current_date,
            exit_price=sell_price,
            exit_reason=reason,
            shares=shares_to_sell,
            stop_loss=self.current_trade.stop_loss,
            target_price=self.current_trade.target_price,
            risk_amount=self.current_trade.risk_amount,
            risk_percentage=self.current_trade.risk_percentage,
            risk_per_share=self.current_trade.risk_per_share,
            trade_id=self.current_trade.trade_id
        )
        # Compute PnL for the slice
        trim_trade.holding_days = (current_date - trim_trade.entry_date).days
        trim_trade.pnl = proceeds - (shares_to_sell * trim_trade.entry_price)
        trim_trade.pnl_percent = (trim_trade.pnl / (shares_to_sell * trim_trade.entry_price)) * 100 if trim_trade.entry_price > 0 else 0.0
        self.completed_trades.append(trim_trade)
        
        # Update remaining open position
        self.current_trade.shares -= shares_to_sell
        self.current_capital += proceeds
        
        event = MarketEvent(
            date=current_date,
            event_type='partial_sell',
            price=sell_price,
            volume=int(current_row['Volume']),
            details={
                'shares_sold': shares_to_sell,
                'shares_remaining': self.current_trade.shares,
                'proceeds': proceeds,
                'reason': reason,
                'capital_after': self.current_capital
            }
        )
        
        log_info(f"🟠 TRIM: Sold {shares_to_sell} of {self.ticker} at ${sell_price:.2f} on {current_date.date()} ({reason}); remaining {self.current_trade.shares}", {
            "ticker": self.ticker,
            "action": "PARTIAL_SELL",
            "shares_sold": shares_to_sell,
            "shares_remaining": self.current_trade.shares,
            "price": sell_price,
            "reason": reason,
            "capital_after": self.current_capital,
            "date": current_date.date().isoformat()
        }, "backtest")
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
    
    async def run_simulation(self, progress_callback=None) -> bool:
        """Run the complete day-by-day simulation with async yields for real-time logging"""
        if self.daily_data is None:
            log_error("No data available for simulation", {"ticker": self.ticker}, "backtest")
            return False
        
        log_info(f"Starting simulation for {self.ticker}", {"ticker": self.ticker}, "backtest")
        await asyncio.sleep(0)  # Yield control to event loop
        
        log_info(f"Initial capital: ${self.initial_capital:,.2f}", {"ticker": self.ticker, "initial_capital": self.initial_capital}, "backtest")
        await asyncio.sleep(0)  # Yield control to event loop
        
        log_info(f"Period: {self.daily_data.index[0].date()} to {self.daily_data.index[-1].date()}", {
            "ticker": self.ticker,
            "start_date": self.daily_data.index[0].date().isoformat(),
            "end_date": self.daily_data.index[-1].date().isoformat()
        }, "backtest")
        await asyncio.sleep(0)  # Yield control to event loop
        
        # Start simulation from day ~30-50 to have sufficient lookback data but adapt to short periods
        start_idx = max(30, min(50, len(self.daily_data) // 3))
        total_days = len(self.daily_data)
        
        for current_idx in range(start_idx, total_days):
            current_date = self.daily_data.index[current_idx]
            current_row = self.daily_data.iloc[current_idx]
            
            # Get lookback data for screener analysis
            lookback_data = self.daily_data.iloc[:current_idx+1]
            
            # Calculate and report real progress
            progress = (current_idx - start_idx) / (total_days - start_idx) * 100
            if progress_callback:
                progress_callback(progress, f"Processing {current_date.date()}")
            
            # Progress reporting
            if current_idx % 20 == 0:
                log_info(f"Progress: {progress:.1f}% - {current_date.date()} - State: {self.state.value}", {
                    "ticker": self.ticker,
                    "progress": round(progress, 1),
                    "current_date": current_date.date().isoformat(),
                    "state": self.state.value
                }, "backtest")
                await asyncio.sleep(0)  # Yield control to event loop for real-time logging
            
            # Run daily screener
            screener_result = self.run_daily_screener(current_date, lookback_data)
            pattern_found, criteria_details, confidence = screener_result
            
            # Update highlights and generate market events
            daily_events = self.update_highlights_and_events(current_date, current_idx, screener_result)
            
            # Enhanced state machine logic with detailed logging
            log_info(f"📊 {current_date.date()}: State={self.state.value}, Pattern={pattern_found}, Confidence={confidence:.1f}%", {
                "ticker": self.ticker,
                "state": self.state.value,
                "pattern_found": pattern_found,
                "confidence": confidence,
                "date": current_date.date().isoformat()
            }, "backtest")
            await asyncio.sleep(0)  # Yield control to event loop for real-time logging
            
            if self.state == TradingState.NOT_IN_TRADE:
                if pattern_found and confidence > 60:
                    self.state = TradingState.MOMENTUM_DETECTED
                    log_info(f"🔴 MOMENTUM_DETECTED: Pattern detected for {self.ticker} on {current_date.date()} (confidence: {confidence:.1f}%)", {
                        "ticker": self.ticker,
                        "event": "momentum_detected",
                        "confidence": confidence,
                        "date": current_date.date().isoformat()
                    }, "backtest")
                    await asyncio.sleep(0)  # Yield control to event loop for real-time logging
            
            elif self.state == TradingState.MOMENTUM_DETECTED:
                if not pattern_found or confidence < 60:
                    # Pattern no longer valid, revert to NOT_IN_TRADE
                    self.state = TradingState.NOT_IN_TRADE
                    log_info(f"🔄 NOT_IN_TRADE: Pattern failed for {self.ticker} on {current_date.date()} (confidence: {confidence:.1f}%)", {
                        "ticker": self.ticker,
                        "event": "pattern_failed",
                        "confidence": confidence,
                        "date": current_date.date().isoformat()
                    }, "backtest")
                    await asyncio.sleep(0)  # Yield control to event loop for real-time logging
                else:
                    # Check if consolidation criteria are met RIGHT NOW
                    if criteria_details and 'criterion2_3' in criteria_details:
                        consolidation_met = criteria_details['criterion2_3'].get('met', False)
                        if consolidation_met:
                            self.state = TradingState.CONSOLIDATION
                            log_info(f"🟡 CONSOLIDATION: Consolidation criteria met for {self.ticker} on {current_date.date()}", {
                                "ticker": self.ticker,
                                "event": "consolidation_detected",
                                "date": current_date.date().isoformat()
                            }, "backtest")
                            await asyncio.sleep(0)  # Yield control to event loop for real-time logging
                        else:
                            log_info(f"🔴 MOMENTUM_DETECTED: Still in momentum, consolidation not yet met for {self.ticker} on {current_date.date()}", {
                                "ticker": self.ticker,
                                "event": "momentum_continuing",
                                "date": current_date.date().isoformat()
                            }, "backtest")
                            await asyncio.sleep(0)  # Yield control to event loop for real-time logging
            
            elif self.state == TradingState.CONSOLIDATION:
                # Check if consolidation criteria are still met
                consolidation_still_valid = False
                if criteria_details and 'criterion2_3' in criteria_details:
                    consolidation_still_valid = criteria_details['criterion2_3'].get('met', False)
                
                if not consolidation_still_valid or not pattern_found or confidence < 60:
                    # Consolidation ended - check why
                    if not pattern_found or confidence < 60:
                        self.state = TradingState.NOT_IN_TRADE
                        log_info(f"🔄 NOT_IN_TRADE: Pattern failed during consolidation for {self.ticker} on {current_date.date()}", {
                            "ticker": self.ticker,
                            "event": "pattern_failed_consolidation",
                            "date": current_date.date().isoformat()
                        }, "backtest")
                        await asyncio.sleep(0)  # Yield control to event loop for real-time logging
                    else:
                        # Consolidation ended but pattern still valid - check for breakout
                        if self.check_buy_signal(current_date, current_row):
                            buy_event = self.execute_buy(current_date, current_row)
                            daily_events.append(buy_event)
                            log_info(f"🟢 BREAKOUT BUY: Consolidation ended with breakout for {self.ticker} on {current_date.date()}", {
                                "ticker": self.ticker,
                                "event": "breakout_buy",
                                "date": current_date.date().isoformat()
                            }, "backtest")
                            await asyncio.sleep(0)  # Yield control to event loop for real-time logging
                        else:
                            # Consolidation ended without breakout - back to momentum or not in trade
                            self.state = TradingState.NOT_IN_TRADE
                            log_info(f"🔄 NOT_IN_TRADE: Consolidation ended without breakout for {self.ticker} on {current_date.date()}", {
                                "ticker": self.ticker,
                                "event": "consolidation_ended_no_breakout",
                                "date": current_date.date().isoformat()
                            }, "backtest")
                            await asyncio.sleep(0)  # Yield control to event loop for real-time logging
                else:
                    # Still in consolidation - check for breakout buy signal
                    if self.check_buy_signal(current_date, current_row):
                        buy_event = self.execute_buy(current_date, current_row)
                        daily_events.append(buy_event)
                        log_info(f"🟢 CONSOLIDATION BUY: Breakout from consolidation for {self.ticker} on {current_date.date()}", {
                            "ticker": self.ticker,
                            "event": "consolidation_buy",
                            "date": current_date.date().isoformat()
                        }, "backtest")
                        await asyncio.sleep(0)  # Yield control to event loop for real-time logging
            
            elif self.state == TradingState.IN_POSITION:
                # Progressive trims at 2R, 4R, 8R, ... (sell half and move stop to stepped levels)
                try:
                    if self.enable_progressive_trims and self.current_trade is not None and self.initial_risk_per_share > 0:
                        threshold_price = self.current_trade.entry_price + self.initial_risk_per_share * self.next_trim_multiple
                        if current_row['High'] >= threshold_price and self.current_trade.shares > 1:
                            shares_to_sell = max(1, self.current_trade.shares // 2)
                            reason = f"Trim at {self.next_trim_multiple:.0f}R"
                            trim_event = self.execute_partial_sell(current_date, current_row, shares_to_sell, reason)
                            daily_events.append(trim_event)
                            
                            # Step the numeric stop to previous multiple: after 2R -> BE, 4R -> 2R, 8R -> 4R, ...
                            stepped_multiple = self.next_trim_multiple / 2.0
                            if stepped_multiple <= 1.0:
                                new_stop = self.current_trade.entry_price
                            else:
                                new_stop = self.current_trade.entry_price + (self.initial_risk_per_share * stepped_multiple)
                            
                            prev_stop = self.current_trade.stop_loss
                            self.current_trade.stop_loss = max(prev_stop if prev_stop is not None else new_stop, new_stop)
                            
                            # 20SMA is applied as a close condition via check_sell_signal; include for logging
                            current_idx = self.daily_data.index.get_loc(current_date)
                            sma_20 = self.daily_data.iloc[current_idx]['SMA20'] if 'SMA20' in self.daily_data.columns else np.nan
                            log_info(f"🔒 Stop raised to ${self.current_trade.stop_loss:.2f} after trim (prev: ${prev_stop if prev_stop is not None else float('nan'):.2f}); stepped to {stepped_multiple:.0f}R; 20SMA close filter=${float(sma_20) if not pd.isna(sma_20) else None}", {
                                "ticker": self.ticker,
                                "new_stop": self.current_trade.stop_loss,
                                "prev_stop": prev_stop,
                                "stepped_multiple": stepped_multiple,
                                "sma20": float(sma_20) if not pd.isna(sma_20) else None,
                                "date": current_date.date().isoformat()
                            }, "backtest")
                            
                            # Double the next threshold
                            self.next_trim_multiple *= 2.0
                except Exception:
                    pass
                
                # Intraday stop-loss enforcement at prior breakout day's low or raised stop
                try:
                    stop_level = float(self.current_trade.stop_loss) if self.current_trade else None
                except Exception:
                    stop_level = None
                if self.current_trade and stop_level is not None and current_row['Low'] <= stop_level:
                    # Execute at stop level to cap loss or protect gains
                    sell_event = self.execute_sell(current_date, current_row, "Stop loss hit", price_override=stop_level)
                    daily_events.append(sell_event)
                    log_info(f"⛔ STOP: Intraday stop hit at ${stop_level:.2f}", {
                        "ticker": self.ticker,
                        "event": "stop_loss_hit",
                        "stop_level": stop_level,
                        "date": current_date.date().isoformat()
                    }, "backtest")
                    await asyncio.sleep(0)
                else:
                    # Close-based exit condition remains (below max(dynamic stop, 20SMA))
                    should_sell, sell_reason = self.check_sell_signal(current_date, current_row)
                    if should_sell:
                        sell_event = self.execute_sell(current_date, current_row, sell_reason)
                        daily_events.append(sell_event)
                        log_info(f"🔴 SELL: Position closed for {self.ticker} on {current_date.date()} - Reason: {sell_reason}", {
                            "ticker": self.ticker,
                            "event": "sell",
                            "reason": sell_reason,
                            "date": current_date.date().isoformat()
                        }, "backtest")
                        await asyncio.sleep(0)
                    else:
                        log_info(f"🟢 HOLDING: Position maintained for {self.ticker} on {current_date.date()}", {
                            "ticker": self.ticker,
                            "event": "holding",
                            "date": current_date.date().isoformat()
                        }, "backtest")
                        await asyncio.sleep(0)
            
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
                    'volume': current_row['Volume'],
                    'trading_state': self.state.value,  # Add current state to OHLCV data
                    'sma_20': current_row.get('SMA20', None)  # Add 20-day SMA
                },
                state=self.state,
                active_highlights=active_highlights,
                trade_events=daily_events,
                performance_metrics=performance_metrics
            )
            
            self.backtest_frames.append(frame)
            self.market_events.extend(daily_events)
        
        # Auto-sell at final candle if position is still open
        final_date = self.daily_data.index[-1]
        final_row = self.daily_data.iloc[-1]
        
        if self.state == TradingState.IN_POSITION and self.current_trade:
            log_info(f"💼 {final_date.date()}: Auto-selling open position at final candle", {
                "ticker": self.ticker,
                "event": "auto_sell_final",
                "date": final_date.date().isoformat()
            }, "backtest")
            await asyncio.sleep(0)  # Yield control to event loop for real-time logging
            
            # Execute forced sell at final candle close price
            sell_event = self.execute_sell(final_date, final_row, "Final candle auto-sell")
            
            # Create final frame with the forced sell
            final_performance_metrics = self.calculate_daily_performance(final_date, final_row['Close'])
            
            final_frame = BacktestFrame(
                current_date=final_date,
                ohlcv={
                    'open': final_row['Open'],
                    'high': final_row['High'],
                    'low': final_row['Low'],
                    'close': final_row['Close'],
                    'volume': final_row['Volume'],
                    'trading_state': self.state.value,
                    'sma_20': final_row.get('SMA20', None)
                },
                state=self.state,
                active_highlights=[],
                trade_events=[sell_event],
                performance_metrics=final_performance_metrics
            )
            
            # Update the last frame with the forced sell
            if self.backtest_frames:
                self.backtest_frames[-1] = final_frame
            
            self.market_events.append(sell_event)
            
            log_info(f"💼 {final_date.date()}: Final position closed at ${final_row['Close']:.2f}", {
                "ticker": self.ticker,
                "event": "final_position_closed",
                "price": final_row['Close'],
                "date": final_date.date().isoformat()
            }, "backtest")
            await asyncio.sleep(0)  # Yield control to event loop for real-time logging
        
        log_info("=" * 80, {
            "ticker": self.ticker,
            "event": "simulation_completed"
        }, "backtest")
        await asyncio.sleep(0)  # Yield control to event loop for real-time logging
        
        log_info(f"✅ Simulation completed for {self.ticker}", {
            "ticker": self.ticker,
            "event": "simulation_completed"
        }, "backtest")
        await asyncio.sleep(0)  # Yield control to event loop for real-time logging
        return True
    
    def generate_results(self) -> Dict[str, Any]:
        """Generate comprehensive backtest results"""
        if not self.backtest_frames:
            return {"success": False, "error": "No simulation data available"}
        
        # Final performance metrics
        final_metrics = self.backtest_frames[-1].performance_metrics
        
        # Group completed trade slices by trade_id to form full trades
        trade_groups: Dict[int, List[Trade]] = {}
        for t in self.completed_trades:
            trade_groups.setdefault(int(getattr(t, 'trade_id', 0) or 0), []).append(t)
        # Remove possible zero-ids (should not happen) by mapping each as its own id
        if 0 in trade_groups and len(trade_groups) == 1:
            # Fallback: treat each slice as its own group
            trade_groups = {i+1: [t] for i, t in enumerate(self.completed_trades)}
        
        grouped_pnls = [sum(x.pnl for x in slices) for slices in trade_groups.values()]
        total_trades_count = len(trade_groups)
        winning_trades_count = sum(1 for p in grouped_pnls if p > 0)
        losing_trades_count = sum(1 for p in grouped_pnls if p <= 0)
        total_pnl_sum = sum(grouped_pnls)
        avg_trade_pnl = (total_pnl_sum / total_trades_count) if total_trades_count > 0 else 0.0
        avg_win = (sum(p for p in grouped_pnls if p > 0) / max(1, winning_trades_count)) if winning_trades_count > 0 else 0.0
        avg_loss = (sum(p for p in grouped_pnls if p <= 0) / max(1, losing_trades_count)) if losing_trades_count > 0 else 0.0
        avg_holding_days = 0.0
        if total_trades_count > 0:
            holding_days_list = [max((s.holding_days for s in slices), default=0) for slices in trade_groups.values()]
            avg_holding_days = sum(holding_days_list) / max(1, len(holding_days_list))
        
        # Robust profit factor using sums of wins/losses (not averages)
        wins_sum = float(sum(p for p in grouped_pnls if p > 0))
        losses_sum_abs = float(abs(sum(p for p in grouped_pnls if p <= 0)))
        if losses_sum_abs > 0:
            profit_factor_value = wins_sum / losses_sum_abs
            profit_factor_is_infinite = False
        else:
            profit_factor_value = float('inf') if wins_sum > 0 else 0.0
            profit_factor_is_infinite = wins_sum > 0
        
        trade_stats = {
            "total_trades": total_trades_count,
            "winning_trades": winning_trades_count,
            "losing_trades": losing_trades_count,
            "win_rate": (winning_trades_count / max(1, total_trades_count)) * 100.0,
            "total_pnl": total_pnl_sum,
            "total_return_pct": final_metrics.get('total_return_pct', 0),
            "max_drawdown": final_metrics.get('max_drawdown', 0),
            "avg_win": avg_win,
            "avg_loss": avg_loss,
            "profit_factor": profit_factor_value,
            "profit_factor_is_infinite": profit_factor_is_infinite,
            "sharpe_ratio": self.calculate_sharpe_ratio(),
            "avg_trade_pnl": avg_trade_pnl,
            "avg_holding_days": avg_holding_days
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
                "trading_state": frame.ohlcv.get('trading_state', 'NOT_IN_TRADE'),
                "sma_20": frame.ohlcv.get('sma_20', None),  # Add 20-day SMA
                "momentum_strength": momentum_strength,
                "atr": atr
            })
        
        # Prepare trades for frontend with numbering
        trades_data = []
        for i, trade in enumerate(self.completed_trades, 1):
            trade_dict = trade.to_dict()
            trade_dict['trade_number'] = i
            trades_data.append(trade_dict)
        
        # Prepare entry rows
        entries_data = list(self.entry_events)
        
        # Prepare highlights for frontend
        highlights_data = [highlight.to_dict() for highlight in self.highlight_periods]
        
        # Generate static chart
        chart_path = self.generate_static_chart()
        
        return {
            "success": True,
            "results": trade_stats,
            # Echo supplemental fields for the aggregator
            "bars_loaded": len(price_data),
            "trades": trades_data,
            "entries": entries_data,
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