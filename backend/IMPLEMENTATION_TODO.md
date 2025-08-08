# Implementation TODO (Refactor Plan Tracking)

Completed in this refactor:
- App factory (`app/factory.py`) and settings (`app/settings.py`)
- Routers split into `api/*` with: ticker, screeners, analytics, backtests, watchlists, logs, health, strategies
- Models extracted to `models/*`
- Core services extracted: `services/momentum.py`, `services/consolidation.py`, `services/market_data.py`, `services/serialization.py`
- Watchlists repository (`repos/watchlists_repo.py`)
- Backtest endpoints re-wired to use EnhancedMomentumBacktester
- Start scripts updated to use `app.factory:create_app`
- Backend README and root README updated

Remaining (optional) follow-ups:
- Move symbol universe from `main.py` to `backend/data/symbols.json` and create `repos/symbols_repo.py`; update screeners to use it
- Extract sector strength and related ETF mapping from `main.py` to `services/sector_strength.py`; integrate into momentum analysis where needed
- Remove unused routes from legacy `main.py` after full migration testing (keeping now for compatibility)
- Unit tests for services and routers
- Add linting/formatting (ruff/black/isort) and CI workflow 