#!/usr/bin/env python3
"""
Test the new post-move consolidation system
"""

import yfinance as yf
import pandas as pd
import sys
import os

# Add the backend directory to the path
sys.path.append(os.path.dirname(__file__))

from main import check_momentum_pattern

def test_post_consolidation():
    """Test the new post-consolidation detection"""
    print("=== POST-MOVE CONSOLIDATION TEST ===")
    
    # Fetch SYM data
    symbol = "SYM"
    ticker = yf.Ticker(symbol)
    hist = ticker.history(period="6mo")
    
    if hist.empty:
        print("No data found for SYM")
        return
    
    print(f"Testing {symbol} with post-consolidation detection...")
    print("Looking for: Sharp move + consolidation after")
    print("Expecting: July 14-18 move (with consolidation) over June 13-18 (without)")
    print("Max age: 25 days\n")
    
    # Run momentum pattern analysis
    pattern_found, criteria_details, confidence_score = check_momentum_pattern(hist, symbol)
    
    print(f"\n=== FINAL RESULT ===")
    print(f"Pattern Found: {pattern_found}")
    print(f"Confidence Score: {confidence_score:.1f}%")
    
    # Check criterion 1 details
    criterion1 = criteria_details.get('criterion1', {})
    if criterion1.get('met', False):
        print(f"\n=== DETECTED MOVE ===")
        print(f"Move: {criterion1.get('move_pct', 0):.2f}%")
        start_date = criterion1.get('move_details', {}).get('start_date', 'Unknown')
        end_date = criterion1.get('move_details', {}).get('end_date', 'Unknown')
        print(f"Period: {start_date} to {end_date}")
        print(f"Duration: {criterion1.get('move_details', {}).get('move_duration', 0)} days")
        print(f"Description: {criterion1.get('description', 'No description')}")
        
        # Check success criteria
        is_july_14_18 = '2025-07-14' in start_date and ('2025-07-17' in end_date or '2025-07-18' in end_date)
        is_june_13_18 = '2025-06-13' in start_date and '2025-06-18' in end_date
        is_recent = True  # Both should be recent enough now
        
        if is_july_14_18:
            print("🎯 SUCCESS: Correctly detected July 14-18 with post-consolidation!")
        elif is_june_13_18:
            print("❌ WRONG: Still detecting June 13-18 (should be eliminated by age or lack of post-consolidation)")
        else:
            print(f"? OTHER: Detected different move - {start_date} to {end_date}")
            
    else:
        print(f"\n=== NO MOVE DETECTED ===")
        print(f"Description: {criterion1.get('description', 'No description')}")
        print("This could mean both moves were eliminated (check debug output above)")

if __name__ == "__main__":
    test_post_consolidation()