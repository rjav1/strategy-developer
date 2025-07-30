#!/usr/bin/env python3
"""
Test script for the updated momentum screener with 9-criteria system.
"""

import requests
import json
from typing import List

# API base URL
BASE_URL = "http://localhost:8000"

def test_momentum_screening():
    """Test the updated momentum screening endpoint."""
    
    # Test symbols from the examples in the document
    test_symbols = ["HUT", "TSLA", "UROY", "LCID", "SI"]
    
    # Create a simple criteria object (the endpoint will use default values)
    criteria = {
        "days_large_move": 30,
        "pct_large_move": 0.30,
        "min_consol_days": 3,
        "max_consol_days": 20,
        "max_range_pct": 0.10,
        "below_avg_volume": True,
        "below_avg_range": True,
        "ma10_tolerance_pct": 0.04,
        "reconsol_days": 3,
        "reconsol_volume_pct": 0.8,
        "linear_r2_threshold": 0.7,
        "avoid_barcode_max_avgrange": 0.05
    }
    
    request_data = {
        "symbols": test_symbols,
        "criteria": criteria
    }
    
    try:
        print("Testing momentum screening with updated 9-criteria system...")
        print(f"Test symbols: {test_symbols}")
        print("-" * 50)
        
        response = requests.post(f"{BASE_URL}/screen_momentum", json=request_data)
        
        if response.status_code == 200:
            results = response.json()
            print(f"Success! Found {len(results)} results")
            print("\nResults:")
            print("-" * 50)
            
            for result in results:
                print(f"Symbol: {result['symbol']}")
                print(f"Company: {result.get('name', 'N/A')}")
                print(f"Pattern Strength: {result['pattern_strength']}")
                print(f"Total Criteria Met: {result['total_met']}/6")
                print("Criteria Details:")
                
                criteria_met = result['criteria_met']
                for criterion, met in criteria_met.items():
                    status = "✅ PASSED" if met else "❌ FAILED"
                    print(f"  {criterion}: {status}")
                
                print("-" * 30)
        else:
            print(f"Error: {response.status_code}")
            print(response.text)
            
    except Exception as e:
        print(f"Error testing screener: {e}")

def test_individual_analysis():
    """Test individual stock analysis."""
    
    test_symbol = "TSLA"
    
    try:
        print(f"\nTesting individual analysis for {test_symbol}...")
        print("-" * 50)
        
        response = requests.get(f"{BASE_URL}/analyze/momentum_pattern/{test_symbol}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"Symbol: {result['symbol']}")
            print(f"Pattern Found: {result['pattern_found']}")
            print(f"Confidence Score: {result['confidence_score']:.1f}%")
            print(f"Pattern Strength: {result['pattern_strength']}")
            print(f"Total Criteria Met: {result['total_criteria_met']}/6")
            
            print("\nAnalysis Report:")
            print(result['analysis_report'])
            
        else:
            print(f"Error: {response.status_code}")
            print(response.text)
            
    except Exception as e:
        print(f"Error testing analysis: {e}")

def test_health_check():
    """Test if the API is running."""
    
    try:
        response = requests.get(f"{BASE_URL}/health")
        if response.status_code == 200:
            print("✅ API is running and healthy")
            return True
        else:
            print("❌ API is not responding correctly")
            return False
    except Exception as e:
        print(f"❌ Cannot connect to API: {e}")
        return False

if __name__ == "__main__":
    print("Testing Updated Momentum Screener")
    print("=" * 50)
    
    # First check if API is running
    if test_health_check():
        # Test the screener
        test_momentum_screening()
        
        # Test individual analysis
        test_individual_analysis()
    else:
        print("Please start the API server first:")
        print("cd backend && python main.py") 