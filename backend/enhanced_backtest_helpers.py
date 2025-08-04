"""
Helper functions for enhanced backtesting calculations
"""
import pandas as pd
import numpy as np
from typing import List, Dict, Any
from datetime import datetime

def calculate_momentum_strength_for_frame(frame: Any, frame_index: int, all_frames: List[Any]) -> float:
    """Calculate momentum strength (0-100) for a specific frame"""
    try:
        if frame_index < 10:  # Need at least 10 frames
            return 0.0
        
        current_price = frame.ohlcv['close']
        
        # Look at 10-frame price change
        if frame_index >= 10:
            ten_frames_ago = all_frames[frame_index - 10]
            ten_frames_price = ten_frames_ago.ohlcv['close']
            price_change = (current_price - ten_frames_price) / ten_frames_price
        else:
            price_change = 0.0
        
        # Look at volume trend (5-frame average vs 20-frame average)
        if frame_index >= 20:
            vol_5_avg = np.mean([all_frames[i].ohlcv['volume'] for i in range(frame_index-5, frame_index)])
            vol_20_avg = np.mean([all_frames[i].ohlcv['volume'] for i in range(frame_index-20, frame_index)])
            volume_strength = vol_5_avg / vol_20_avg if vol_20_avg > 0 else 1.0
        else:
            volume_strength = 1.0
        
        # Combine price momentum and volume strength
        momentum = (price_change * 100) + ((volume_strength - 1) * 20)
        return max(0, min(100, momentum + 50))  # Normalize to 0-100
        
    except Exception:
        return 0.0

def calculate_atr_for_frame(frame: Any, frame_index: int, all_frames: List[Any]) -> float:
    """Calculate Average True Range for a specific frame"""
    try:
        if frame_index < 14:  # Need 14 frames for ATR
            return 0.0
        
        # Calculate True Range for last 14 frames
        tr_values = []
        for i in range(frame_index - 13, frame_index + 1):
            if i <= 0:
                continue
            
            current = all_frames[i]
            previous = all_frames[i - 1]
            
            high_low = current.ohlcv['high'] - current.ohlcv['low']
            high_close_prev = abs(current.ohlcv['high'] - previous.ohlcv['close'])
            low_close_prev = abs(current.ohlcv['low'] - previous.ohlcv['close'])
            
            tr = max(high_low, high_close_prev, low_close_prev)
            tr_values.append(tr)
        
        return sum(tr_values) / len(tr_values) if tr_values else 0.0
        
    except Exception:
        return 0.0