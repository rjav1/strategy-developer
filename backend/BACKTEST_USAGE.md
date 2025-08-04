# Momentum Screener Backtest Engine - Usage Guide

## Overview

This backtesting engine implements a comprehensive day-by-day simulation of the momentum screener strategy with visual playback capabilities. It integrates your existing momentum screener logic with a state-machine-based trading system.

## Features

### 🔄 Three-State Trading Cycle
1. **NOT IN TRADE**: Default state, runs screener daily
2. **IN PROGRESS**: Pattern detected, waiting for buy signal  
3. **BOUGHT**: Position held, monitoring for exit signals

### 📊 Integration Points
- **Momentum Screener**: Uses your existing `check_momentum_pattern()` function
- **Buy Signals**: Breakout above previous day's high with volume confirmation
- **Sell Signals**: Stop loss, take profit (2:1 R/R), time exit, momentum failure

### 📈 Visual Replay
- **Momentum Periods**: Highlighted in light green
- **Consolidation Periods**: Highlighted in light yellow
- **Buy Points**: Green upward arrows
- **Sell Points**: Red downward arrows
- **Moving Averages**: SMA10, SMA20, SMA50 overlay

## Usage

### Command Line Interface

```bash
# Basic usage
python backtest_strategy.py --ticker ALAB

# Specify time period
python backtest_strategy.py --ticker TSLA --period 1y

# Custom initial capital
python backtest_strategy.py --ticker AAPL --period 2y --capital 25000

# All options
python backtest_strategy.py --ticker NVDA --period 1y --capital 10000 --save-chart
```

### Available Parameters

| Parameter | Description | Options | Default |
|-----------|-------------|---------|---------|
| `--ticker` | Stock symbol | Any valid ticker | Required |
| `--period` | Historical data period | 6mo, 1y, 2y, 5y | 1y |
| `--capital` | Initial capital | Any positive number | $10,000 |
| `--save-chart` | Save chart to file | Flag | False |

## Testing

Run the test suite to verify functionality:

```bash
python test_backtest.py
```

This will test the backtester with multiple tickers (ALAB, TSLA, AAPL) and validate:
- Data fetching
- Momentum screener integration
- Buy/sell signal logic
- State machine transitions
- Performance calculations

## Expected Output

### Console Output
```
🚀 Momentum Screener Backtest Engine
==================================================
Initialized MomentumBacktester for ALAB
Fetching 1y of data for ALAB...
Successfully fetched 252 days of data
Date range: 2023-01-01 to 2024-01-01

Starting backtest simulation for ALAB...
Initial capital: $10,000.00
Simulation period: 2023-02-20 to 2024-01-01
============================================================
Progress: 2023-02-20 - State: NOT_IN_TRADE
🔍 2023-03-15: Pattern detected - Moving to IN_PROGRESS
🚀 2023-03-18: BUY at $45.25, Stop: $42.10
💰 2023-03-25: SELL at $51.40 (Take Profit) - P&L: $6.15 (+13.6%)
============================================================
Backtest simulation completed!

============================================================
PERFORMANCE SUMMARY - ALAB
============================================================
📊 Trading Statistics:
   Total Trades: 12
   Winning Trades: 8
   Losing Trades: 4
   Win Rate: 66.7%
   Average Holding Period: 5.2 days

💰 Financial Performance:
   Total P&L: $1,247.50
   Total Return: +12.48%
   Average Trade P&L: $103.96
   Average Win: $185.25
   Average Loss: -$98.75

📈 Risk Metrics:
   Max Drawdown: -4.2%
   Sharpe Ratio: 1.85

📋 Trade Log:
    1. 2023-03-18 to 2023-03-25: $45.25 → $51.40 = +$6.15 (+13.6%) [7d]
    2. 2023-05-12 to 2023-05-19: $38.90 → $35.25 = -$3.65 (-9.4%) [7d]
    ...
```

### Visual Chart

The generated chart shows:
- **Price Chart**: Candlestick or line chart with moving averages
- **Highlighted Periods**: 
  - Light green background = Momentum moves
  - Light yellow background = Consolidation periods
- **Trade Markers**:
  - Green arrows ↑ = Buy signals
  - Red arrows ↓ = Sell signals
- **Volume Chart**: Below price chart with color-coded bars
- **Performance Box**: Summary statistics overlay

## Integration with Existing Code

### Momentum Screener Integration
The backtester uses your existing momentum screener functions:

```python
# Uses your check_momentum_pattern() function
pattern_found, criteria_details, confidence_score = check_momentum_pattern(
    screening_data, self.ticker
)

# Tracks move boundaries for visualization
self.update_tracking_periods(current_date, criteria_details)
```

### Criterion 1 Modification
As requested, the backtester implements dynamic evaluation:
- Runs screener daily on rolling historical data
- Updates move boundaries if subsequent candles extend the move
- Maintains recency bias (25-day lookback maximum)

### Buy/Sell Logic
Built-in trading logic that can be easily extended:

```python
# Buy Signal: Breakout + Volume
if current_candle['Close'] > prev_candle['High']:
    if current_candle['Volume'] > avg_volume * 1.2:
        return True, entry_price, stop_loss

# Sell Signals: Multiple exit conditions
if current_candle['Low'] <= trade.stop_loss:
    return True, trade.stop_loss, "Stop Loss"
# ... additional exit conditions
```

## Performance Metrics

The backtester calculates comprehensive performance metrics:

- **Trade Statistics**: Total trades, win rate, average holding period
- **Financial Performance**: Total P&L, returns, average trade performance
- **Risk Metrics**: Maximum drawdown, Sharpe ratio
- **Detailed Trade Log**: Individual trade analysis

## Customization

### Adding New Exit Conditions
Modify the `check_sell_signal()` method:

```python
def check_sell_signal(self, current_date: datetime, trade: Trade) -> Tuple[bool, Optional[float], str]:
    # Add your custom exit logic here
    if your_custom_condition:
        return True, exit_price, "Custom Exit"
    
    # Existing logic...
```

### Modifying Buy Conditions
Update the `check_buy_signal()` method:

```python
def check_buy_signal(self, current_date: datetime) -> Tuple[bool, Optional[float], Optional[float]]:
    # Add your custom entry logic here
    if your_custom_buy_condition:
        return True, entry_price, stop_loss
    
    # Existing logic...
```

### Visualization Customization
Modify the `create_visualization()` method to add custom indicators or change styling.

## Troubleshooting

### Common Issues

1. **No Data Available**: Ensure ticker symbol is valid and has sufficient historical data
2. **Import Errors**: Make sure you're running from the backend directory
3. **No Trades Generated**: Check if momentum patterns exist in the data period
4. **Visualization Issues**: Ensure matplotlib is installed and configured properly

### Debug Mode
Add debug prints to see detailed execution:

```python
# In run_backtest() method, uncomment debug lines
print(f"Debug: {current_date.date()} - Checking pattern...")
```

## Files Created

- `backtest_strategy.py`: Main backtesting engine
- `test_backtest.py`: Test suite for validation
- `BACKTEST_USAGE.md`: This usage guide
- `{TICKER}_backtest_results.png`: Generated chart (if --save-chart used)

## Next Steps

1. **Run Test**: `python test_backtest.py`
2. **Test with Your Ticker**: `python backtest_strategy.py --ticker ALAB`
3. **Analyze Results**: Review performance metrics and chart
4. **Customize**: Modify buy/sell logic as needed
5. **Production**: Integrate with your existing trading system

The backtester is now ready to provide comprehensive analysis of your momentum screener strategy with full visual playback capabilities!