#!/usr/bin/env python3
"""
Test SYM momentum detection to see what's being incorrectly detected
"""

import yfinance as yf
import pandas as pd
import sys
import os

# Add the backend directory to the path
sys.path.append(os.path.dirname(__file__))

from main import check_momentum_pattern, detect_momentum_move_boundaries

def test_sym_detection():
    """Test what the current algorithm detects for SYM"""
    print("=== SYM Momentum Detection Test ===")
    
    # Fetch SYM data
    symbol = "SYM"
    ticker = yf.Ticker(symbol)
    hist = ticker.history(period="6mo")
    
    if hist.empty:
        print("No data found for SYM")
        return
    
    print(f"Data range: {hist.index[0].strftime('%Y-%m-%d')} to {hist.index[-1].strftime('%Y-%m-%d')}")
    print(f"Total data points: {len(hist)}")
    
    # Run momentum pattern analysis
    pattern_found, criteria_details, confidence_score = check_momentum_pattern(hist, symbol)
    
    print(f"\nPattern Found: {pattern_found}")
    print(f"Confidence Score: {confidence_score:.1f}%")
    
    # Check criterion 1 details
    criterion1 = criteria_details.get('criterion1', {})
    if criterion1.get('met', False):
        print(f"\n=== Current Detection (INCORRECT) ===")
        print(f"Detected Move: {criterion1.get('move_pct', 0):.2f}%")
        print(f"Start: {criterion1.get('move_details', {}).get('start_date', 'Unknown')}")
        print(f"End: {criterion1.get('move_details', {}).get('end_date', 'Unknown')}")
        print(f"Duration: {criterion1.get('move_details', {}).get('move_duration', 0)} days")
        print(f"Required Move: {criterion1.get('adjusted_threshold', 0):.2f}%")
        print(f"Base Threshold (3x ADR): {criterion1.get('base_threshold', 0):.2f}%")
        print(f"Candle Factor: {criterion1.get('candle_factor', 0):.2f}%")
        print(f"Number of candles: {criterion1.get('number_of_move_candles', 0)}")
        print(f"Description: {criterion1.get('description', 'No description')}")
    else:
        print(f"\n=== No Move Detected ===")
        print(f"Description: {criterion1.get('description', 'No description')}")
    
    # Test the momentum boundary detection directly
    print(f"\n=== Testing Momentum Boundary Detection ===")
    
    # Prepare data like the main function does
    df = hist.copy()
    df['SMA10'] = df['Close'].rolling(window=10).mean()
    df['SMA20'] = df['Close'].rolling(window=20).mean()
    df['SMA50'] = df['Close'].rolling(window=50).mean()
    df['daily_range_pct'] = (df['High'] - df['Low']) / df['Open'] * 100
    df['ADR_20'] = df['daily_range_pct'].rolling(window=20).mean()
    df['volume_sma'] = df['Volume'].rolling(window=50).mean()
    
    # Test the boundary detection function directly
    start_candle, end_candle, move_pct, move_details = detect_momentum_move_boundaries(df)
    
    if start_candle != -1:
        print(f"Boundary Detection Results:")
        print(f"  Start: {df.index[start_candle].strftime('%Y-%m-%d')} (index {start_candle})")
        print(f"  End: {df.index[end_candle].strftime('%Y-%m-%d')} (index {end_candle})")
        print(f"  Move: {move_pct:.2f}%")
        print(f"  Score: {move_details.get('move_score', 0):.2f}")
        
        # Check days from end for July 14-18
        july_14_idx = None
        july_18_idx = None
        for i, date in enumerate(df.index):
            if date.month == 7 and date.day == 14:
                july_14_idx = i
            if date.month == 7 and date.day == 18:
                july_18_idx = i
        
        if july_14_idx is not None and july_18_idx is not None:
            july_start_price = df.iloc[july_14_idx]['Low']
            july_end_price = df.iloc[july_18_idx]['High']
            july_move = ((july_end_price - july_start_price) / july_start_price) * 100
            
            # Calculate what days from end this would be
            days_from_end_july = len(df) - july_18_idx
            
            print(f"\n  July 14-18 Alternative:")
            print(f"    Start: {df.index[july_14_idx].strftime('%Y-%m-%d')} (index {july_14_idx})")
            print(f"    End: {df.index[july_18_idx].strftime('%Y-%m-%d')} (index {july_18_idx})")  
            print(f"    Move: {july_move:.2f}%")
            print(f"    Days from end: {days_from_end_july}")
            
            # Calculate recency bonus for both
            detected_days_from_end = len(df) - end_candle
            print(f"\n  Recency Analysis:")
            print(f"    Detected move days from end: {detected_days_from_end}")
            print(f"    July move days from end: {days_from_end_july}")
            
            # Calculate recency bonuses (updated to match new algorithm)
            def get_recency_bonus(days_from_end):
                if days_from_end <= 3:
                    return 10.0
                elif days_from_end <= 7:
                    return 8.0
                elif days_from_end <= 14:
                    return 6.0
                elif days_from_end <= 21:
                    return 4.0
                elif days_from_end <= 30:
                    return 2.0
                else:
                    return 1.0
            
            detected_bonus = get_recency_bonus(detected_days_from_end)
            july_bonus = get_recency_bonus(days_from_end_july)
            
            print(f"    Detected move recency bonus: {detected_bonus}x")
            print(f"    July move recency bonus: {july_bonus}x")
            
            print(f"\n  Why July move might be missed:")
            print(f"    July move is more recent: {days_from_end_july < detected_days_from_end}")
            print(f"    July move should get higher bonus: {july_bonus > detected_bonus}")
    else:
        print("No momentum move detected by boundary function")
    
    # Look for July 14-18 data manually
    print(f"\n=== Manual July 14-18 Analysis ===")
    july_data = hist[hist.index.month == 7]
    if not july_data.empty:
        # Look for July 14-18 range
        july_14_18 = hist[(hist.index.day >= 14) & (hist.index.day <= 18) & (hist.index.month == 7)]
        if not july_14_18.empty:
            start_price = july_14_18['Low'].iloc[0]
            end_price = july_14_18['High'].iloc[-1]
            manual_move = ((end_price - start_price) / start_price) * 100
            
            print(f"July 14-18 manual calculation:")
            print(f"  Start: ${start_price:.2f} on {july_14_18.index[0].strftime('%Y-%m-%d')}")
            print(f"  End: ${end_price:.2f} on {july_14_18.index[-1].strftime('%Y-%m-%d')}")
            print(f"  Move: {manual_move:.2f}%")
            print(f"  Duration: {len(july_14_18)} days")
            
            # Calculate what the current threshold would be
            if 'adr_20' in criterion1:
                adr_20 = criterion1['adr_20']
                base_threshold = adr_20 * 3
                
                print(f"  Current algorithm threshold: {base_threshold:.2f}% (3x ADR {adr_20:.2f}%)")
                print(f"  Would pass threshold: {manual_move > base_threshold}")
        else:
            print("No July 14-18 data found")
    else:
        print("No July data found")

if __name__ == "__main__":
    test_sym_detection()