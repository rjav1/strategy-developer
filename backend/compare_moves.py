#!/usr/bin/env python3
"""
Compare all potential moves to see why June 13-18 beats July 14-18
"""

import yfinance as yf
import pandas as pd
import sys
import os

# Add the backend directory to the path
sys.path.append(os.path.dirname(__file__))

def compare_all_moves():
    """Compare different move periods to understand selection"""
    print("=== Move Comparison Analysis ===")
    
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
    
    # Find indices for different moves
    moves_to_test = [
        ("June 13-18", 6, 13, 6, 18),
        ("July 14-18", 7, 14, 7, 18),  
        ("July 22-31", 7, 22, 7, 31)
    ]
    
    valid_moves = []
    
    for move_name, start_month, start_day, end_month, end_day in moves_to_test:
        start_idx = None
        end_idx = None
        
        for i, date in enumerate(df.index):
            if date.month == start_month and date.day == start_day:
                start_idx = i
            if date.month == end_month and date.day == end_day:
                end_idx = i
        
        if start_idx is None or end_idx is None:
            print(f"\n{move_name}: Date not found")
            continue
            
        # Calculate move metrics
        start_price = df.iloc[start_idx]['Low']
        end_price = df.iloc[end_idx]['High']
        move_pct = ((end_price - start_price) / start_price) * 100
        move_duration = end_idx - start_idx + 1
        move_velocity = move_pct / move_duration
        days_from_end = len(df) - end_idx
        
        # Volume analysis
        move_data = df.iloc[start_idx:end_idx+1]
        avg_volume_ratio = move_data['volume_ratio'].mean()
        max_volume_ratio = move_data['volume_ratio'].max()
        
        # Momentum analysis
        strong_momentum_days = sum(1 for i in range(len(move_data)) 
                                 if move_data.iloc[i]['momentum_5'] > current_adr)
        momentum_consistency = strong_momentum_days / len(move_data)
        
        print(f"\n=== {move_name} ===")
        print(f"Move: {move_pct:.2f}% in {move_duration} days")
        print(f"Velocity: {move_velocity:.2f}% per day")
        print(f"Days from end: {days_from_end}")
        print(f"Avg volume: {avg_volume_ratio:.2f}")
        print(f"Peak volume: {max_volume_ratio:.2f}")
        print(f"Momentum consistency: {momentum_consistency:.2f}")
        
        # Check requirements
        passes_duration = move_duration <= 6
        passes_velocity = move_velocity >= current_adr * 0.6
        passes_volume = avg_volume_ratio >= 1.2 and max_volume_ratio >= 1.8
        passes_momentum = momentum_consistency >= 0.6
        
        print(f"Passes duration: {passes_duration}")
        print(f"Passes velocity: {passes_velocity}")
        print(f"Passes volume: {passes_volume}")
        print(f"Passes momentum: {passes_momentum}")
        
        if passes_duration and passes_velocity and passes_volume and passes_momentum:
            # Calculate scoring
            velocity_score = move_velocity * 10.0
            volume_surge_score = max_volume_ratio * 5.0
            move_strength_score = move_pct * 3.0
            
            # Velocity bonus
            if move_velocity > current_adr * 1.5:
                velocity_bonus = 3.0
            elif move_velocity > current_adr * 1.0:
                velocity_bonus = 2.0
            else:
                velocity_bonus = 1.0
            
            # Duration bonus
            if move_duration <= 3:
                duration_bonus = 2.0
            elif move_duration <= 5:
                duration_bonus = 1.5
            else:
                duration_bonus = 1.0
            
            # Recency bonus
            if days_from_end <= 7:
                recency_bonus = 2.5
            elif days_from_end <= 14:
                recency_bonus = 2.0
            elif days_from_end <= 21:
                recency_bonus = 1.5
            else:
                recency_bonus = 1.0
            
            base_score = velocity_score + volume_surge_score + move_strength_score
            final_score = base_score * velocity_bonus * duration_bonus * recency_bonus
            
            print(f"Base score: {base_score:.2f}")
            print(f"Velocity bonus: {velocity_bonus}x")
            print(f"Duration bonus: {duration_bonus}x")
            print(f"Recency bonus: {recency_bonus}x")
            print(f"FINAL SCORE: {final_score:.2f}")
            print("✅ VALID MOVE")
            
            valid_moves.append((move_name, final_score, move_velocity, days_from_end))
        else:
            print("❌ ELIMINATED")
    
    if valid_moves:
        print(f"\n=== RANKING ===")
        valid_moves.sort(key=lambda x: x[1], reverse=True)
        for i, (name, score, velocity, days_from_end) in enumerate(valid_moves):
            print(f"{i+1}. {name}: Score {score:.2f} ({velocity:.2f}% per day, {days_from_end} days from end)")

if __name__ == "__main__":
    compare_all_moves()