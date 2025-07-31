"""
Breakout Strategy - High Tight Flag Breakout Detection

This strategy identifies stocks that have passed the momentum screener (indicating a large move up followed by consolidation)
and waits for an upward breakout from the consolidation period. Entry occurs when:
1. Price breaks above the consolidation high on a 5-minute candle
2. A subsequent 5-minute candle closes higher than the breakout candle (breaking 5-minute highs)
3. Volume in the first X minutes (where X is the time from market open to breakout confirmation) 
   is higher than the average volume for the same time period during the consolidation

Strategy designed for 5-minute timeframe execution on stocks from watchlists.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Optional
from datetime import datetime, timedelta

# Strategy metadata
metadata = {
    "name": "Breakout Strategy",
    "type": "multi_asset",  # Can handle multiple stocks from watchlist
    "description": "High tight flag breakout detection with 5-minute confirmation and volume validation",
    "timeframe": "5min",
    "author": "Trading Strategy Tester",
    "version": "1.0.0"
}

def calculate_consolidation_range(data: pd.DataFrame, consolidation_start: int, consolidation_end: int) -> Dict:
    """
    Calculate the consolidation range from the momentum screener results.
    
    Args:
        data: DataFrame with OHLCV data
        consolidation_start: Index where consolidation period starts
        consolidation_end: Index where consolidation period ends
    
    Returns:
        Dict with consolidation high, low, and range
    """
    consolidation_data = data.iloc[consolidation_start:consolidation_end+1]
    
    consolidation_high = consolidation_data['High'].max()
    consolidation_low = consolidation_data['Low'].min()
    consolidation_range = consolidation_high - consolidation_low
    
    return {
        'high': consolidation_high,
        'low': consolidation_low,
        'range': consolidation_range,
        'start_idx': consolidation_start,
        'end_idx': consolidation_end,
        'period_length': len(consolidation_data)
    }

def detect_breakout(data: pd.DataFrame, consolidation_info: Dict) -> Optional[Dict]:
    """
    Detect if price has broken above the consolidation high.
    
    Args:
        data: DataFrame with 5-minute OHLCV data
        consolidation_info: Consolidation range information
    
    Returns:
        Dict with breakout information or None if no breakout
    """
    consolidation_high = consolidation_info['high']
    
    # Look for candles that close above the consolidation high
    breakout_candidates = data[data['Close'] > consolidation_high].copy()
    
    if len(breakout_candidates) == 0:
        return None
    
    # Get the first breakout candle
    first_breakout_idx = breakout_candidates.index[0]
    breakout_candle = data.loc[first_breakout_idx]
    
    return {
        'breakout_idx': first_breakout_idx,
        'breakout_price': breakout_candle['Close'],
        'breakout_high': breakout_candle['High'],
        'breakout_volume': breakout_candle['Volume'],
        'breakout_time': breakout_candle.name if hasattr(breakout_candle, 'name') else first_breakout_idx
    }

def check_five_minute_high_break(data: pd.DataFrame, breakout_info: Dict) -> Optional[Dict]:
    """
    Check if a subsequent 5-minute candle closes higher than the breakout candle.
    
    Args:
        data: DataFrame with 5-minute OHLCV data
        breakout_info: Breakout information
    
    Returns:
        Dict with confirmation information or None if not confirmed
    """
    breakout_idx = breakout_info['breakout_idx']
    breakout_high = breakout_info['breakout_high']
    
    # Look for candles after the breakout that close higher
    subsequent_data = data[data.index > breakout_idx]
    
    if len(subsequent_data) == 0:
        return None
    
    # Find the first candle that closes higher than the breakout candle's high
    confirmation_candidates = subsequent_data[subsequent_data['Close'] > breakout_high]
    
    if len(confirmation_candidates) == 0:
        return None
    
    confirmation_idx = confirmation_candidates.index[0]
    confirmation_candle = data.loc[confirmation_idx]
    
    return {
        'confirmation_idx': confirmation_idx,
        'confirmation_price': confirmation_candle['Close'],
        'confirmation_volume': confirmation_candle['Volume'],
        'confirmation_time': confirmation_candle.name if hasattr(confirmation_candle, 'name') else confirmation_idx
    }

def calculate_volume_criteria(data: pd.DataFrame, consolidation_info: Dict, confirmation_info: Dict) -> Dict:
    """
    Calculate volume criteria for entry confirmation.
    
    Args:
        data: DataFrame with 5-minute OHLCV data
        consolidation_info: Consolidation range information
        confirmation_info: Confirmation information
    
    Returns:
        Dict with volume analysis results
    """
    confirmation_idx = confirmation_info['confirmation_idx']
    
    # Calculate how many 5-minute candles from market open to confirmation
    # Assuming market opens at 9:30 AM and each candle represents 5 minutes
    market_open_idx = 0  # First candle of the day
    candles_to_confirmation = confirmation_idx - market_open_idx + 1
    
    # Calculate today's volume for the same time period
    today_volume = data.iloc[market_open_idx:confirmation_idx+1]['Volume'].sum()
    
    # Calculate average volume for the same time period during consolidation
    consolidation_start = consolidation_info['start_idx']
    consolidation_end = consolidation_info['end_idx']
    
    # Get the same number of candles from the start of each day during consolidation
    consolidation_days = []
    current_idx = consolidation_start
    
    while current_idx <= consolidation_end:
        # Find the start of the day (assuming 5-minute data, 78 candles per day)
        day_start = current_idx - (current_idx % 78)
        day_end = min(day_start + 78, consolidation_end)
        
        # Get the first X candles of this day (where X is candles_to_confirmation)
        day_candles = min(candles_to_confirmation, day_end - day_start)
        if day_candles > 0:
            day_volume = data.iloc[day_start:day_start + day_candles]['Volume'].sum()
            consolidation_days.append(day_volume)
        
        current_idx = day_end + 1
    
    if len(consolidation_days) == 0:
        return {
            'volume_met': False,
            'today_volume': today_volume,
            'avg_consolidation_volume': 0,
            'volume_ratio': 0
        }
    
    avg_consolidation_volume = np.mean(consolidation_days)
    volume_ratio = today_volume / avg_consolidation_volume if avg_consolidation_volume > 0 else 0
    
    return {
        'volume_met': volume_ratio > 1.0,  # Today's volume > average consolidation volume
        'today_volume': today_volume,
        'avg_consolidation_volume': avg_consolidation_volume,
        'volume_ratio': volume_ratio,
        'candles_to_confirmation': candles_to_confirmation
    }

def calculate_stop_loss(data: pd.DataFrame, entry_idx: int) -> float:
    """
    Calculate stop loss at the low of the day.
    
    Args:
        data: DataFrame with 5-minute OHLCV data
        entry_idx: Index where entry occurs
    
    Returns:
        Stop loss price
    """
    # Find the start of the current day
    day_start = entry_idx - (entry_idx % 78)  # Assuming 78 5-minute candles per day
    day_data = data.iloc[day_start:entry_idx+1]
    
    return day_data['Low'].min()

def generate_signals(data: pd.DataFrame, symbol: str, consolidation_info: Optional[Dict] = None) -> pd.DataFrame:
    """
    Generate trading signals for the breakout strategy.
    
    Args:
        data: DataFrame with 5-minute OHLCV data
        symbol: Stock symbol
        consolidation_info: Consolidation information from momentum screener
    
    Returns:
        DataFrame with signals
    """
    signals = pd.DataFrame(index=data.index)
    signals['symbol'] = symbol
    signals['signal'] = 0  # 0 = no signal, 1 = buy, -1 = sell
    signals['entry_price'] = np.nan
    signals['stop_loss'] = np.nan
    signals['target_price'] = np.nan
    signals['confidence'] = 0.0
    
    # If no consolidation info provided, we can't generate signals
    if consolidation_info is None:
        return signals
    
    # Detect breakout
    breakout_info = detect_breakout(data, consolidation_info)
    if breakout_info is None:
        return signals
    
    # Check for 5-minute high break confirmation
    confirmation_info = check_five_minute_high_break(data, breakout_info)
    if confirmation_info is None:
        return signals
    
    # Check volume criteria
    volume_analysis = calculate_volume_criteria(data, consolidation_info, confirmation_info)
    if not volume_analysis['volume_met']:
        return signals
    
    # All criteria met - generate buy signal
    entry_idx = confirmation_info['confirmation_idx']
    entry_price = confirmation_info['confirmation_price']
    stop_loss = calculate_stop_loss(data, entry_idx)
    
    # Calculate target price (2:1 risk-reward ratio)
    risk = entry_price - stop_loss
    target_price = entry_price + (risk * 2)
    
    # Calculate confidence based on volume ratio
    confidence = min(volume_analysis['volume_ratio'] / 2.0, 1.0)  # Cap at 1.0
    
    signals.loc[entry_idx, 'signal'] = 1
    signals.loc[entry_idx, 'entry_price'] = entry_price
    signals.loc[entry_idx, 'stop_loss'] = stop_loss
    signals.loc[entry_idx, 'target_price'] = target_price
    signals.loc[entry_idx, 'confidence'] = confidence
    
    return signals

def screen(universe_data: Dict[str, pd.DataFrame]) -> List[str]:
    """
    Screen function for multi-asset strategies.
    This strategy doesn't screen - it works with stocks already selected by the momentum screener.
    
    Args:
        universe_data: Dict of DataFrames with OHLCV data for each symbol
    
    Returns:
        List of symbols to trade (all symbols that have data)
    """
    return list(universe_data.keys())

# Strategy configuration
strategy_config = {
    "min_volume_ratio": 1.0,  # Minimum volume ratio for entry
    "risk_reward_ratio": 2.0,  # Target risk-reward ratio
    "max_position_size": 0.02,  # Maximum 2% of portfolio per trade
    "use_trailing_stop": False,  # Fixed stop loss at day low
    "require_consolidation_info": True  # Strategy requires consolidation data from screener
}

def get_strategy_info() -> Dict:
    """
    Get strategy information for the backtest engine.
    
    Returns:
        Dict with strategy metadata and configuration
    """
    return {
        "metadata": metadata,
        "config": strategy_config,
        "functions": {
            "generate_signals": generate_signals,
            "screen": screen
        }
    } 