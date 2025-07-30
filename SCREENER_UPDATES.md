# Momentum Screener Updates - 5 Star Trading Setup Implementation

## Overview

The momentum screener has been completely updated to implement the "5 Star Trading Setup/Pattern Checklist" from the trading strategy document. The system now uses a dynamic 9-criteria approach with specific modifications as requested.

## Key Changes Made

### 1. Updated Criteria System

**Previous System:** Used a complex parameterized system with many configurable thresholds
**New System:** Implements the exact 9 criteria from the trading strategy document

### 2. Criteria Implementation

#### Criterion 1: Large Percentage Move
- **Requirement:** >3 ADR move within last 30 days
- **Implementation:** Checks the last 30 days of price data for a move greater than 3x the 20-day Average Daily Range
- **Dynamic:** Accepts moves greater than 3 ADR (no upper limit)

#### Criteria 2 & 3: Consolidation Pattern
- **Requirement:** 3-20+ days consolidation with lower volume and range
- **Implementation:** 
  - Looks for consolidation periods of 3-20 days
  - Checks for ADR (Average Daily Range) between 3-20%
  - Verifies volume is below average during consolidation
  - Ensures body sizes (open/close) are smaller than range
- **Dynamic:** Time period is flexible, longer consolidations may be better or worse

#### Criterion 4: MA10 Tolerance
- **Requirement:** Stock within 3-4% of Moving Average 10
- **Implementation:** Calculates percentage deviation from MA10
- **Dynamic:** Accepts 3-4% above or below MA10

#### Criterion 7: Reconsolidation After Breakout
- **Requirement:** Check for lower volume after initial breakout
- **Implementation:** Looks for volume spike followed by lower volume period
- **Dynamic:** Analyzes volume patterns dynamically

#### Criterion 8: Linear and Orderly Moves
- **Requirement:** Stock has linear and orderly price movements
- **Implementation:** Calculates R-squared correlation of price vs time
- **Dynamic:** Uses dynamic threshold (R² ≥ 0.6)

#### Criterion 9: Avoid Barcode Patterns
- **Requirement:** Avoid volatile stocks with erratic movements
- **Implementation:** Checks average range and range standard deviation
- **Dynamic:** Evaluates volatility patterns dynamically

### 3. Removed Criteria

**Criteria 5 & 6 have been completely removed** as requested:
- Criterion 5: Volume spike on breakout day
- Criterion 6: Close at HOD (High of Day)

### 4. Updated Functions

#### `check_momentum_pattern()`
- Completely rewritten to implement the 9-criteria system
- Returns detailed criteria breakdown
- Uses dynamic thresholds throughout
- Calculates confidence score based on criteria met

#### `screen_momentum()` Endpoint
- Updated to use the new criteria system
- Simplified parameter handling
- Better error handling and reporting
- Improved sorting by criteria met and pattern strength

#### `analyze_momentum_pattern()` Endpoint
- Updated to use the new criteria system
- Enhanced analysis report with detailed criteria breakdown
- Improved chart generation
- Better pattern strength classification

### 5. Dynamic Parameters

The system now emphasizes **dynamic analysis** over strict rules:

- **Time Periods:** Consolidation can be 3-20+ days, with flexibility
- **Percentage Ranges:** Large moves accepted greater than 3 ADR
- **Volume Analysis:** Relative volume comparisons rather than fixed thresholds
- **Range Analysis:** ADR between 3-20% with dynamic evaluation
- **MA Proximity:** 3-4% tolerance around MA10
- **Volatility Assessment:** Dynamic evaluation of price movement patterns

### 6. Pattern Strength Classification

Updated pattern strength thresholds:
- **Strong:** 80%+ confidence (5-6 criteria met)
- **Moderate:** 60-79% confidence (4 criteria met)
- **Weak:** 40-59% confidence (3 criteria met)
- **Very Weak:** <40% confidence (0-2 criteria met)

### 7. Data Requirements

- **Minimum Data:** 50 days of historical data
- **Default Period:** 3 months for analysis
- **Moving Averages:** SMA10, SMA20 calculated automatically
- **ADR Calculation:** 20-day Average Daily Range calculated automatically
- **Volume Analysis:** 50-day volume moving average

## API Endpoints

### 1. Screen Momentum
```
POST /screen_momentum
```
- Screens multiple symbols using the 9-criteria system
- Returns detailed results with criteria breakdown
- Sorted by pattern strength and criteria met

### 2. Analyze Individual Stock
```
GET /analyze/momentum_pattern/{symbol}
```
- Detailed analysis of a single stock
- Comprehensive report with all criteria details
- Interactive chart with annotations
- Pattern strength and confidence scoring

## Testing

A test script (`test_screener.py`) has been created to verify the functionality:
- Tests screening with example stocks (HUT, TSLA, UROY, LCID, SI)
- Tests individual stock analysis
- Validates API connectivity and response format

## Usage Example

```python
# Screen multiple stocks
response = requests.post("http://localhost:8000/screen_momentum", json={
    "symbols": ["TSLA", "AAPL", "NVDA"],
    "criteria": {
        "days_large_move": 30,
        "pct_large_move": 0.30,
        # ... other criteria
    }
})

# Analyze single stock
response = requests.get("http://localhost:8000/analyze/momentum_pattern/TSLA")
```

## Key Benefits

1. **Dynamic Analysis:** No rigid rules, adapts to market conditions
2. **Comprehensive Criteria:** Covers all aspects of the 5 Star Trading Setup
3. **Detailed Reporting:** Clear breakdown of which criteria are met
4. **Flexible Thresholds:** Accepts ranges rather than exact values
5. **Better Pattern Recognition:** More sophisticated consolidation detection
6. **Volume Integration:** Proper volume analysis during consolidation
7. **Volatility Assessment:** Avoids barcode patterns effectively

## Future Enhancements

1. **Sector Analysis:** Integration with sector rotation analysis
2. **Market Context:** Consider broader market conditions
3. **Risk Management:** Add position sizing recommendations
4. **Backtesting:** Historical pattern validation
5. **Real-time Alerts:** Notifications for new pattern formations

## Conclusion

The updated screener now accurately implements the "5 Star Trading Setup/Pattern Checklist" with dynamic parameters and comprehensive analysis. It provides traders with a sophisticated tool for identifying high-probability momentum setups while maintaining the flexibility emphasized in the trading strategy document. 