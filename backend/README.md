# Backend

This backend is a FastAPI service for ticker data, momentum screening, analytics, watchlists, and backtesting (including enhanced live-replay backtests).

## Structure

- `app/`
  - `factory.py`: `create_app()` builds the FastAPI app and mounts routers
  - `settings.py`: environment-driven configuration (CORS, cache TTLs, timeouts, file paths)
- `api/` (routers only, no business logic)
  - `ticker.py`, `screeners.py`, `analytics.py`, `backtests.py`, `watchlists.py`, `logs.py`
- `models/` (Pydantic schemas)
  - `market.py`, `screeners.py`, `backtests.py`, `watchlists.py`
- `services/` (domain logic)
  - `market_data.py`, `momentum.py`, `consolidation.py`, `serialization.py`
- `repos/`
  - `watchlists_repo.py` (file-based repo for watchlists)
- `enhanced_backtest_strategy.py` (existing enhanced backtester, reused)
- `logging_manager.py` (existing, reused)

## Run locally

From the repo root:

```
cd backend
uvicorn app.factory:create_app --reload --host 0.0.0.0 --port 8000
```

Or use the Windows batch file (update it to use the factory):

```
start_backend.bat
```

## Environment

Create a `.env` in `backend/` to override defaults:

```
APP_TITLE=Advanced Momentum Trading Strategy API
APP_VERSION=2.1.0
NYSE_TICKER_CACHE_TTL=43200
SECTOR_CACHE_TTL=7200
DEFAULT_CACHE_TTL=300
YFINANCE_TIMEOUT=8
EXT_CALL_TIMEOUT=10
WATCHLIST_FILE=backend/watchlist.json
WATCHLISTS_FILE=backend/watchlists.json
```

## Notes
- All endpoints remain compatible. Business logic has moved into `services/` for testability.
- `enhanced_backtest_strategy.py` continues to work and now should import from `services` (follow-up step if needed). 