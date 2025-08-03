#!/usr/bin/env python3
"""
Test the new velocity-based system for detecting sharp moves
"""

import yfinance as yf
import pandas as pd
import sys
import os

# Add the backend directory to the path
sys.path.append(os.path.dirname(__file__))

def test_velocity_system():
    """Test velocity system on SYM July moves"""
    print("=== Velocity-Based Sharp Move Detection Test ===")
    
    # Fetch SYM data
    symbol = "SYM"
    ticker = yf.Ticker(symbol)
    hist = ticker.history(period="6mo")
    
    # Prepare data
    df = hist.copy()
    df['daily_range_pct'] = (df['High'] - df['Low']) / df['Open'] * 100
    df['ADR_20'] = df['daily_range_pct'].rolling(window=20).mean()
    df['volume_sma'] = df['Volume'].rolling(window=50).mean()
    df['price_change_pct'] = df['Close'].pct_change() * 100
    df['volume_ratio'] = df['Volume'] / df['volume_sma']
    df['momentum_5'] = df['Close'].pct_change(5) * 100
    
    current_adr = df['ADR_20'].iloc[-1]
    required_move = current_adr * 3
    
    print(f"Current ADR: {current_adr:.2f}%")
    print(f"Required move: {required_move:.2f}%")
    
    # Find indices for both moves
    july_14_idx = None
    july_18_idx = None
    july_22_idx = None
    july_31_idx = None
    
    for i, date in enumerate(df.index):
        if date.month == 7 and date.day == 14:
            july_14_idx = i
        if date.month == 7 and date.day == 18:
            july_18_idx = i
        if date.month == 7 and date.day == 22:
            july_22_idx = i
        if date.month == 7 and date.day == 31:
            july_31_idx = i
    
    if not all([july_14_idx, july_18_idx, july_22_idx, july_31_idx]):
        print("Could not find all required dates")
        return
    
    # Test both moves
    moves = [
        ("July 14-18 (SHARP)", july_14_idx, july_18_idx),
        ("July 22-31 (GRIND)", july_22_idx, july_31_idx)
    ]
    
    for move_name, start_idx, end_idx in moves:
        print(f"\n=== {move_name} ===")
        
        # Basic move metrics
        start_price = df.iloc[start_idx]['Low']
        end_price = df.iloc[end_idx]['High']
        move_pct = ((end_price - start_price) / start_price) * 100
        move_duration = end_idx - start_idx + 1
        move_velocity = move_pct / move_duration
        
        print(f"Move: {move_pct:.2f}% in {move_duration} days")
        print(f"Velocity: {move_velocity:.2f}% per day")
        
        # Check basic requirements
        passes_duration = move_duration <= 6
        passes_threshold = move_pct > required_move
        passes_velocity = move_velocity >= current_adr * 0.6
        
        print(f"Passes duration (≤6): {passes_duration}")
        print(f"Passes threshold: {passes_threshold}")
        print(f"Passes velocity (≥{current_adr * 0.6:.2f}%/day): {passes_velocity}")
        
        if not (passes_duration and passes_threshold and passes_velocity):
            print("❌ ELIMINATED: Basic requirements not met")
            continue
        
        # Volume analysis
        move_data = df.iloc[start_idx:end_idx+1]
        avg_volume_ratio = move_data['volume_ratio'].mean()
        max_volume_ratio = move_data['volume_ratio'].max()
        
        passes_avg_volume = avg_volume_ratio >= 1.2
        passes_volume_surge = max_volume_ratio >= 1.8
        
        print(f"Avg volume ratio: {avg_volume_ratio:.2f} (need ≥1.2)")
        print(f"Peak volume ratio: {max_volume_ratio:.2f} (need ≥1.8)")
        print(f"Passes volume: {passes_avg_volume and passes_volume_surge}")
        
        if not (passes_avg_volume and passes_volume_surge):
            print("❌ ELIMINATED: Volume requirements not met")
            continue
        
        # Momentum consistency
        strong_momentum_days = sum(1 for i in range(len(move_data)) 
                                 if move_data.iloc[i]['momentum_5'] > current_adr)
        momentum_consistency = strong_momentum_days / len(move_data)
        passes_momentum = momentum_consistency >= 0.6
        
        print(f"Momentum consistency: {momentum_consistency:.2f} (need ≥0.6)")
        print(f"Passes momentum: {passes_momentum}")
        
        if not passes_momentum:
            print("❌ ELIMINATED: Momentum consistency not met")
            continue
        
        # Calculate velocity-based score
        velocity_score = move_velocity * 10.0
        volume_surge_score = max_volume_ratio * 5.0
        move_strength_score = move_pct * 3.0
        
        # Velocity bonus
        if move_velocity > current_adr * 1.5:
            velocity_bonus = 3.0
            velocity_type = "VERY SHARP"
        elif move_velocity > current_adr * 1.0:
            velocity_bonus = 2.0
            velocity_type = "SHARP"
        else:
            velocity_bonus = 1.0
            velocity_type = "NORMAL"
        
        # Duration bonus
        if move_duration <= 3:
            duration_bonus = 2.0
            duration_type = "VERY QUICK"
        elif move_duration <= 5:
            duration_bonus = 1.5
            duration_type = "QUICK"
        else:
            duration_bonus = 1.0
            duration_type = "NORMAL"
        
        # Calculate final score (simplified - no recency/consolidation)
        base_score = velocity_score + volume_surge_score + move_strength_score
        final_score = base_score * velocity_bonus * duration_bonus
        
        print(f"Velocity score: {velocity_score:.2f}")
        print(f"Volume surge score: {volume_surge_score:.2f}")
        print(f"Move strength score: {move_strength_score:.2f}")
        print(f"Base score: {base_score:.2f}")
        print(f"Velocity bonus: {velocity_bonus}x ({velocity_type})")
        print(f"Duration bonus: {duration_bonus}x ({duration_type})")
        print(f"FINAL SCORE: {final_score:.2f}")
        print("✅ VALID SHARP MOVE")

if __name__ == "__main__":
    test_velocity_system()