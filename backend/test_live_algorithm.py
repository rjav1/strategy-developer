#!/usr/bin/env python3
"""
Test the live momentum detection algorithm with the new velocity system
"""

import yfinance as yf
import pandas as pd
import sys
import os

# Add the backend directory to the path
sys.path.append(os.path.dirname(__file__))

from main import check_momentum_pattern

def test_live_algorithm():
    """Test the live algorithm to see what it detects for SYM"""
    print("=== Live Algorithm Test ===")
    
    # Fetch SYM data
    symbol = "SYM"
    ticker = yf.Ticker(symbol)
    hist = ticker.history(period="6mo")
    
    if hist.empty:
        print("No data found for SYM")
        return
    
    # Run momentum pattern analysis
    pattern_found, criteria_details, confidence_score = check_momentum_pattern(hist, symbol)
    
    print(f"Pattern Found: {pattern_found}")
    print(f"Confidence Score: {confidence_score:.1f}%")
    
    # Check criterion 1 details
    criterion1 = criteria_details.get('criterion1', {})
    if criterion1.get('met', False):
        print(f"\n=== DETECTED MOVE ===")
        print(f"Move: {criterion1.get('move_pct', 0):.2f}%")
        print(f"Start: {criterion1.get('move_details', {}).get('start_date', 'Unknown')}")
        print(f"End: {criterion1.get('move_details', {}).get('end_date', 'Unknown')}")
        print(f"Duration: {criterion1.get('move_details', {}).get('move_duration', 0)} days")
        print(f"Description: {criterion1.get('description', 'No description')}")
        
        # Check if it's the correct July 14-18 range
        start_date = criterion1.get('move_details', {}).get('start_date', '')
        end_date = criterion1.get('move_details', {}).get('end_date', '')
        
        if '2025-07-14' in start_date and ('2025-07-18' in end_date or '2025-07-17' in end_date or '2025-07-16' in end_date):
            print("🎯 SUCCESS: Correctly detected July 14-18 sharp move!")
        elif '2025-07-22' in start_date:
            print("❌ WRONG: Still detecting July 22+ slow grind")
        else:
            print(f"? DIFFERENT: Detected {start_date} to {end_date}")
    else:
        print(f"\n=== NO MOVE DETECTED ===")
        print(f"Description: {criterion1.get('description', 'No description')}")

if __name__ == "__main__":
    test_live_algorithm()