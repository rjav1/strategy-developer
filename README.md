# Trading Strategy Tester

A professional desktop application for traders and quants to upload historical data, backtest trading strategies (both single and multi-asset), run advanced simulations, and analyze performance — all within a clean, professional UI.

## Architecture

- **Frontend**: React + TypeScript + Vite + TailwindCSS
- **Desktop Shell**: Electron (cross-platform desktop app)
- **Backend**: Python FastAPI (strategy execution, backtesting engine)
- **Storage**: Local filesystem (CSV, JSON)
- **Communication**: HTTP API between Electron frontend and Python backend

## Features

### Core Functionality
- **Ticker Lookup**: Real-time stock and crypto data with interactive charts
- **Data Upload**: Upload CSV/Excel files with OHLCV data
- **Strategy Management**: Upload Python strategy scripts with validation
- **Screening**: Multi-asset filtering with custom screener scripts
- **Backtest Engine**: Run simulations with multiple test modes
- **Results Analysis**: View, compare, and export backtest results
- **Settings**: Configure trading parameters and preferences

### Strategy Support
- **Single-Asset Strategies**: Traditional time-series backtesting
- **Multi-Asset Strategies**: Screened universe with filtering
- **Strategy Validation**: Automatic function signature checking
- **Metadata Support**: Strategy information and configuration

### Backtest Modes
- **Standard Backtest**: Traditional time-series simulation
- **Monte Carlo**: Resample returns for robustness testing
- **Grid Search**: Parameter optimization
- **Permutation Test**: Signal randomization for validation

## Installation

### Prerequisites
- Node.js 18+ and npm
- Python 3.8+ with pip
- Git

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd trading-strategy-tester
   ```

2. **Install dependencies**
   ```bash
   # Install root dependencies
   npm install
   
   # Install frontend dependencies
   cd frontend
   npm install
   cd ..
   
   # Install backend dependencies
   cd backend
   pip install -r requirements.txt
   cd ..
   ```

3. **Run the application**
   ```bash
   # Development mode
   npm run dev
   
   # Or run components separately:
   # Terminal 1: Backend
   cd backend && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
   
   # Terminal 2: Frontend
   cd frontend && npm run dev
   
   # Terminal 3: Electron
   npm start
   ```

## Development

### Project Structure
```
trading-strategy-tester/
├── electron/           # Electron main process and preload
├── frontend/           # React frontend (Vite)
│   ├── src/
│   │   ├── components/ # Reusable UI components
│   │   ├── pages/      # Page components
│   │   └── ...
├── backend/            # Python FastAPI backend
│   ├── main.py         # Main API server
│   └── requirements.txt
├── assets/             # App icons and assets
└── package.json        # Root package.json for Electron
```

### Scripts
- `npm run dev`: Start development environment
- `npm run build`: Build frontend for production
- `npm start`: Start Electron app
- `npm run package`: Package for distribution

### API Endpoints

#### Ticker Data
- `GET /ticker/{symbol}`: Get ticker data with caching
- `GET /health`: Health check

#### Strategy Management
- `POST /strategies/upload`: Upload Python strategy file
- `GET /strategies`: List all strategies

#### Data Management
- `POST /data/upload`: Upload historical data file
- `GET /data`: List all data files

#### Backtesting
- `POST /backtest/run`: Run backtest with configuration
- `GET /backtest/results`: List all results
- `GET /backtest/results/{id}`: Get specific result

## Strategy Format

### Single-Asset Strategy
```python
metadata = {
    "name": "My Strategy",
    "type": "single_asset"
}

def generate_signals(data):
    # data: pandas DataFrame with OHLCV columns
    # Return: DataFrame with signal columns
    return signals_df
```

### Multi-Asset Strategy
```python
metadata = {
    "name": "My Multi-Asset Strategy",
    "type": "screened_multi"
}

def screen(universe_data):
    # universe_data: dict of DataFrames
    # Return: list of symbols to trade
    return ["AAPL", "MSFT", "GOOGL"]

def generate_signals(data, symbol):
    # data: DataFrame for specific symbol
    # symbol: string symbol name
    # Return: DataFrame with signals
    return signals_df
```

## Data Format

Upload CSV files with the following columns:
- `Date`: Date in YYYY-MM-DD format
- `Open`: Opening price
- `High`: High price
- `Low`: Low price
- `Close`: Closing price
- `Volume`: Trading volume

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Roadmap

### Phase 1 - Core Features ✅
- [x] Basic Electron setup
- [x] React frontend with routing
- [x] Python backend API
- [x] Ticker lookup functionality
- [x] Basic UI components

### Phase 2 - Strategy Engine
- [ ] Strategy upload and validation
- [ ] Data upload and processing
- [ ] Basic backtest engine
- [ ] Results visualization

### Phase 3 - Advanced Features
- [ ] Monte Carlo simulations
- [ ] Grid search optimization
- [ ] Advanced analytics
- [ ] Export functionality

### Phase 4 - Polish
- [ ] App packaging
- [ ] Performance optimization
- [ ] Documentation
- [ ] Testing suite 