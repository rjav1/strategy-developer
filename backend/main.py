import yfinance as yf
from fastapi import FastAPI, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import json
from datetime import datetime, timedelta
import time
import pandas as pd
import os

app = FastAPI(title="Trading Strategy Tester API", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory cache
cache = {}
CACHE_DURATION = 60  # 1 minute in seconds

# In-memory storage for strategies and data
strategies = {}
uploaded_data = {}
backtest_results = {}

class TickerData(BaseModel):
    symbol: str
    name: str
    current_price: float
    daily_change: float
    daily_change_percent: float
    timestamps: List[str]
    prices: List[float]
    highs: List[float]
    lows: List[float]
    opens: List[float]
    volumes: List[int]

class StrategyMetadata(BaseModel):
    name: str
    type: str  # "single_asset" or "screened_multi"
    description: Optional[str] = None

class BacktestConfig(BaseModel):
    strategy_id: str
    data_id: str
    screener_id: Optional[str] = None
    initial_capital: float = 100000
    commission: float = 0.001
    slippage: float = 0.0005

class BacktestResult(BaseModel):
    id: str
    strategy_name: str
    dataset_name: str
    performance: float
    sharpe_ratio: float
    max_drawdown: float
    total_trades: int
    win_rate: float
    equity_curve: List[float]
    trade_log: List[Dict]

class ScreenResult(BaseModel):
    symbol: str
    value: float
    name: Optional[str] = None

def get_cache_key(symbol: str, range_param: str) -> str:
    return f"{symbol}_{range_param}"

def is_cache_valid(timestamp: float) -> bool:
    return time.time() - timestamp < CACHE_DURATION

def format_timestamps(timestamps):
    formatted = []
    for ts in timestamps:
        if hasattr(ts, 'strftime'):
            formatted.append(ts.strftime('%Y-%m-%d %H:%M:%S'))
        else:
            formatted.append(str(ts))
    return formatted

@app.get("/")
async def root():
    return {"message": "Trading Strategy Tester API", "version": "1.0.0"}

@app.get("/ticker/{symbol}")
async def get_ticker_data(
    symbol: str,
    range: str = Query(default="1d", regex="^(1d|1w|1m|3m|6m|1y|5y|max)$")
):
    """
    Get ticker data for stocks and crypto with caching support.
    
    Args:
        symbol: Stock or crypto symbol (e.g., AAPL, BTC-USD)
        range: Time range (1d, 1w, 1m, 3m, 6m, 1y, 5y, max)
    """
    cache_key = get_cache_key(symbol.upper(), range)
    
    # Check cache first
    if cache_key in cache and is_cache_valid(cache[cache_key]['timestamp']):
        return cache[cache_key]['data']
    
    try:
        # Create ticker object
        ticker = yf.Ticker(symbol.upper())
        
        # Get ticker info for current price and metadata
        info = ticker.info
        if not info or 'regularMarketPrice' not in info:
            raise HTTPException(status_code=404, detail=f"Ticker '{symbol}' not found or invalid")
        
        # Map range to yfinance period
        period_map = {
            "1d": "1d",
            "1w": "5d", 
            "1m": "1mo",
            "3m": "3mo",
            "6m": "6mo",
            "1y": "1y",
            "5y": "5y",
            "max": "max"
        }
        
        # Get historical data
        hist = ticker.history(period=period_map[range])
        
        if hist.empty:
            raise HTTPException(status_code=404, detail=f"No historical data found for ticker '{symbol}'")
        
        # Calculate daily change
        current_price = info.get('regularMarketPrice', hist['Close'].iloc[-1])
        previous_close = info.get('regularMarketPreviousClose', hist['Close'].iloc[-2] if len(hist) > 1 else current_price)
        daily_change = current_price - previous_close
        daily_change_percent = (daily_change / previous_close * 100) if previous_close != 0 else 0
        
        # Prepare response data
        response_data = TickerData(
            symbol=symbol.upper(),
            name=info.get('longName', info.get('shortName', symbol.upper())),
            current_price=float(current_price),
            daily_change=float(daily_change),
            daily_change_percent=float(daily_change_percent),
            timestamps=format_timestamps(hist.index.tolist()),
            prices=hist['Close'].tolist(),
            highs=hist['High'].tolist(),
            lows=hist['Low'].tolist(),
            opens=hist['Open'].tolist(),
            volumes=hist['Volume'].fillna(0).astype(int).tolist()
        )
        
        # Cache the response
        cache[cache_key] = {
            'data': response_data,
            'timestamp': time.time()
        }
        
        return response_data
        
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Error fetching data for '{symbol}': {str(e)}")

# Strategy management endpoints
@app.post("/strategies/upload")
async def upload_strategy(file: UploadFile = File(...)):
    """Upload a Python strategy file"""
    if not file.filename.endswith('.py'):
        raise HTTPException(status_code=400, detail="Only Python files are allowed")
    
    try:
        content = await file.read()
        strategy_id = f"strategy_{int(time.time())}"
        
        # Basic validation - check for required functions
        content_str = content.decode('utf-8')
        if 'def generate_signals(' not in content_str:
            raise HTTPException(status_code=400, detail="Strategy must contain generate_signals function")
        
        strategies[strategy_id] = {
            'id': strategy_id,
            'name': file.filename.replace('.py', ''),
            'content': content_str,
            'uploaded_at': datetime.now().isoformat()
        }
        
        return {"id": strategy_id, "name": strategies[strategy_id]['name']}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading strategy: {str(e)}")

@app.get("/strategies")
async def list_strategies():
    """List all uploaded strategies"""
    return list(strategies.values())

# Data management endpoints
@app.post("/data/upload")
async def upload_data(file: UploadFile = File(...)):
    """Upload historical data file"""
    if not file.filename.endswith(('.csv', '.xlsx')):
        raise HTTPException(status_code=400, detail="Only CSV and Excel files are allowed")
    
    try:
        content = await file.read()
        data_id = f"data_{int(time.time())}"
        
        # Store file info
        uploaded_data[data_id] = {
            'id': data_id,
            'name': file.filename,
            'size': len(content),
            'uploaded_at': datetime.now().isoformat()
        }
        
        return {"id": data_id, "name": uploaded_data[data_id]['name']}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading data: {str(e)}")

@app.get("/data")
async def list_data():
    """List all uploaded data files"""
    return list(uploaded_data.values())

# Backtest endpoints
@app.post("/backtest/run")
async def run_backtest(config: BacktestConfig):
    """Run a backtest with the given configuration"""
    try:
        # Validate inputs
        if config.strategy_id not in strategies:
            raise HTTPException(status_code=404, detail="Strategy not found")
        
        if config.data_id not in uploaded_data:
            raise HTTPException(status_code=404, detail="Data not found")
        
        # Simulate backtest execution
        result_id = f"result_{int(time.time())}"
        
        # Mock results for demonstration
        result = BacktestResult(
            id=result_id,
            strategy_name=strategies[config.strategy_id]['name'],
            dataset_name=uploaded_data[config.data_id]['name'],
            performance=12.5,  # Mock performance
            sharpe_ratio=1.85,
            max_drawdown=-8.3,
            total_trades=45,
            win_rate=0.68,
            equity_curve=[100, 102, 105, 103, 108, 112.5],  # Mock equity curve
            trade_log=[{"date": "2024-01-01", "action": "BUY", "price": 100, "quantity": 100}]  # Mock trade log
        )
        
        backtest_results[result_id] = result.dict()
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error running backtest: {str(e)}")

@app.get("/backtest/results")
async def list_results():
    """List all backtest results"""
    return list(backtest_results.values())

@app.get("/backtest/results/{result_id}")
async def get_result(result_id: str):
    """Get a specific backtest result"""
    if result_id not in backtest_results:
        raise HTTPException(status_code=404, detail="Result not found")
    return backtest_results[result_id]

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

# Screening endpoints
@app.get("/screen/high_momentum", response_model=List[ScreenResult])
async def screen_high_momentum(
    period: str = Query("3mo", regex="^(1d|5d|1mo|3mo|6mo|1y|5y|max)$", description="Historical data period"),
    top_n: int = Query(10, description="Number of top momentum stocks to return")
):
    """
    Screen stocks for high momentum based on price change over specified period.
    
    Args:
        symbols: List of ticker symbols to screen
        period: Time period for data (1d, 5d, 1mo, 3mo, 6mo, 1y, 5y, max)
        top_n: Number of top momentum stocks to return
    
    Returns:
        List of ScreenResult objects sorted by momentum (descending)
    """
    # Major US stocks to screen
    major_stocks = [
        'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'BRK-B', 'JPM', 'V',
        'JNJ', 'PG', 'UNH', 'HD', 'MA', 'DIS', 'PYPL', 'BAC', 'ADBE', 'CRM',
        'NFLX', 'INTC', 'PFE', 'ABT', 'KO', 'PEP', 'TMO', 'ABBV', 'MRK', 'AVGO',
        'WMT', 'COST', 'ACN', 'DHR', 'LLY', 'NEE', 'TXN', 'HON', 'UNP', 'RTX',
        'QCOM', 'LOW', 'UPS', 'INTU', 'SPGI', 'TGT', 'ISRG', 'SBUX', 'GILD', 'ADI',
        'AMGN', 'MDLZ', 'REGN', 'VRTX', 'KLAC', 'PANW', 'SNPS', 'CDNS', 'MU', 'ORCL'
    ]
    
    results = []
    
    for symbol in major_stocks:
        try:
            ticker = yf.Ticker(symbol.upper())
            hist = ticker.history(period=period)
            
            if hist.empty or len(hist) < 2:
                continue
                
            start_price = hist['Close'].iloc[0]
            end_price = hist['Close'].iloc[-1]
            
            if start_price <= 0:
                continue
                
            momentum = (end_price - start_price) / start_price
            info = ticker.info
            name = info.get('longName', info.get('shortName', symbol.upper())) if info else symbol.upper()
            
            results.append(ScreenResult(
                symbol=symbol.upper(), 
                value=float(momentum),
                name=name
            ))
            
        except Exception as e:
            print(f"Error processing {symbol}: {str(e)}")
            continue
    
    # Sort by momentum (descending) and return top_n results
    sorted_results = sorted(results, key=lambda x: x.value, reverse=True)
    return sorted_results[:top_n]

@app.get("/screen/low_volatility", response_model=List[ScreenResult])
async def screen_low_volatility(
    period: str = Query("3mo", regex="^(1d|5d|1mo|3mo|6mo|1y|5y|max)$", description="Historical data period"),
    top_n: int = Query(10, description="Number of lowest volatility stocks to return")
):
    """
    Screen stocks for low volatility based on standard deviation of returns.
    
    Args:
        symbols: List of ticker symbols to screen
        period: Time period for data (1d, 5d, 1mo, 3mo, 6mo, 1y, 5y, max)
        top_n: Number of lowest volatility stocks to return
    
    Returns:
        List of ScreenResult objects sorted by volatility (ascending)
    """
    # Major US stocks to screen
    major_stocks = [
        'AAPL', 'PLTR', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'BRK-B', 'JPM', 'V',
        'JNJ', 'PG', 'UNH', 'HD', 'MA', 'DIS', 'PYPL', 'BAC', 'ADBE', 'CRM',
        'NFLX', 'INTC', 'PFE', 'ABT', 'KO', 'PEP', 'TMO', 'ABBV', 'MRK', 'AVGO',
        'WMT', 'COST', 'ACN', 'DHR', 'LLY', 'NEE', 'TXN', 'HON', 'UNP', 'RTX',
        'QCOM', 'LOW', 'UPS', 'INTU', 'SPGI', 'TGT', 'ISRG', 'SBUX', 'GILD', 'ADI',
        'AMGN', 'MDLZ', 'REGN', 'VRTX', 'KLAC', 'PANW', 'SNPS', 'CDNS', 'MU', 'ORCL'
    ]
    
    results = []
    
    for symbol in major_stocks:
        try:
            ticker = yf.Ticker(symbol.upper())
            hist = ticker.history(period=period)
            
            if hist.empty or len(hist) < 2:
                continue
                
            # Calculate daily returns and volatility
            returns = hist['Close'].pct_change().dropna()
            
            if len(returns) < 5:  # Need at least 5 data points for meaningful volatility
                continue
                
            volatility = returns.std()
            info = ticker.info
            name = info.get('longName', info.get('shortName', symbol.upper())) if info else symbol.upper()
            
            results.append(ScreenResult(
                symbol=symbol.upper(), 
                value=float(volatility),
                name=name
            ))
            
        except Exception as e:
            print(f"Error processing {symbol}: {str(e)}")
            continue
    
    # Sort by volatility (ascending) and return top_n results
    sorted_results = sorted(results, key=lambda x: x.value)
    return sorted_results[:top_n]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 