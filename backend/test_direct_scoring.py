#!/usr/bin/env python3
"""
Direct test to compare July 14-18 vs July 22-31 scoring
"""

import yfinance as yf
import pandas as pd
import sys
import os

# Add the backend directory to the path
sys.path.append(os.path.dirname(__file__))

def test_direct_scoring():
    """Test direct scoring of both moves"""
    print("=== Direct Move Scoring Test ===")
    
    # Fetch SYM data
    symbol = "SYM"
    ticker = yf.Ticker(symbol)
    hist = ticker.history(period="6mo")
    
    # Prepare data
    df = hist.copy()
    df['SMA10'] = df['Close'].rolling(window=10).mean()
    df['SMA20'] = df['Close'].rolling(window=20).mean()
    df['SMA50'] = df['Close'].rolling(window=50).mean()
    df['daily_range_pct'] = (df['High'] - df['Low']) / df['Open'] * 100
    df['ADR_20'] = df['daily_range_pct'].rolling(window=20).mean()
    df['volume_sma'] = df['Volume'].rolling(window=50).mean()
    df['price_change_pct'] = df['Close'].pct_change() * 100
    df['volume_ratio'] = df['Volume'] / df['volume_sma']
    df['momentum_5'] = df['Close'].pct_change(5) * 100
    
    current_adr = df['ADR_20'].iloc[-1]
    
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
        ("July 14-18", july_14_idx, july_18_idx),
        ("July 22-31", july_22_idx, july_31_idx)
    ]
    
    for move_name, start_idx, end_idx in moves:
        print(f"\n=== {move_name} Move Analysis ===")
        
        # Calculate move
        start_price = df.iloc[start_idx]['Low']
        end_price = df.iloc[end_idx]['High']
        move_pct = ((end_price - start_price) / start_price) * 100
        move_duration = end_idx - start_idx + 1
        days_from_end = len(df) - end_idx
        
        print(f"Move: {move_pct:.2f}%")
        print(f"Duration: {move_duration} days")
        print(f"Days from end: {days_from_end}")
        
        # Check threshold
        required_move = current_adr * 3
        passes_threshold = move_pct > required_move
        print(f"Passes threshold: {passes_threshold} ({move_pct:.2f}% > {required_move:.2f}%)")
        
        if not passes_threshold:
            print("❌ ELIMINATED: Doesn't pass threshold")
            continue
        
        # Quality analysis
        move_data = df.iloc[start_idx:end_idx+1]
        
        # Up ratio
        up_days = sum(1 for i in range(len(move_data)) 
                     if move_data.iloc[i]['price_change_pct'] > 0)
        up_ratio = up_days / len(move_data)
        
        # Volume ratio
        avg_volume_ratio = move_data['volume_ratio'].mean()
        volume_score = min(avg_volume_ratio / 1.5, 2.0)
        
        # Momentum ratio
        positive_momentum_days = sum(1 for i in range(len(move_data)) 
                                   if move_data.iloc[i]['momentum_5'] > 0)
        momentum_ratio = positive_momentum_days / len(move_data)
        
        print(f"Up ratio: {up_ratio:.2f}")
        print(f"Volume ratio: {avg_volume_ratio:.2f}")
        print(f"Momentum ratio: {momentum_ratio:.2f}")
        
        # Overall quality
        overall_quality = (up_ratio + min(avg_volume_ratio, 2.0) + momentum_ratio) / 3
        passes_quality = overall_quality >= 0.3
        print(f"Overall quality: {overall_quality:.2f} (need ≥ 0.3)")
        print(f"Passes quality: {passes_quality}")
        
        if not passes_quality:
            print("❌ ELIMINATED: Doesn't pass quality")
            continue
        
        # Recency bonus (modest - updated to match new algorithm)
        if days_from_end <= 7:
            recency_bonus = 2.5
        elif days_from_end <= 14:
            recency_bonus = 2.0
        elif days_from_end <= 21:
            recency_bonus = 1.5
        else:
            recency_bonus = 1.0
        
        print(f"Recency bonus: {recency_bonus}x")
        
        # Calculate final score (updated weights - EXTREME EMPHASIS ON MOVE STRENGTH)
        base_score = move_pct * 8.0  # 8x weight for move percentage - MOVE STRENGTH IS KING
        quality_score = (up_ratio * 0.4 + volume_score * 0.3 + momentum_ratio * 0.3) * 20
        consolidation_bonus = 1.0  # Assume no perfect consolidation
        final_score = (base_score + quality_score) * consolidation_bonus * recency_bonus
        
        print(f"Base score: {base_score:.2f}")
        print(f"Quality score: {quality_score:.2f}")
        print(f"Final score: {final_score:.2f}")
        print(f"✅ VALID MOVE")

if __name__ == "__main__":
    test_direct_scoring()