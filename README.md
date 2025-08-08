# Strategy Developer

Modern app for momentum screening, watchlists, and enhanced backtesting with visual playback.

## Monorepo Layout

- `backend/` FastAPI service (routers in `api/`, domain logic in `services/`, schemas in `models/`)
- `frontend/` Next.js app (app router)
- `electron/` Desktop shell (loads frontend)

## Requirements
- Python 3.10+
- Node.js 18+

## Backend: run locally
```
cd backend
pip install -r requirements.txt
uvicorn app.factory:create_app --reload --host 0.0.0.0 --port 8000
```
Or on Windows:
```
start_backend.bat
```

Environment overrides via `backend/.env` (see `backend/README.md`).

## Frontend: run locally
```
cd frontend
npm install
npm run dev
```
The app expects backend at `http://localhost:8000`.

## Electron (optional)
```
cd electron
npm install
npm run start
```
Electron attempts to load the dev server (frontend) on ports 3000-3004.

## Endpoints (unchanged)
- `GET /ticker/{symbol}`
- `POST /screen_momentum`, `POST /screen_momentum_stream`
- `GET /analyze/momentum_pattern/{symbol}`
- `POST /backtest/momentum`, `POST /backtest/momentum/stream`, `POST /backtest/momentum/progress`, `GET /backtest/progress/{job_id}`, `POST /backtest/multi-symbol`
- `GET /logs`, `DELETE /logs`, `GET /logs/stream`, `WS /ws/logs`
- `GET /watchlists`, `POST /watchlists`, `POST /watchlists/{id}/symbols`, `DELETE /watchlists/{id}/symbols/{symbol}`, `DELETE /watchlists/{id}`
- Legacy: `GET /watchlist`, `POST /watchlist`, `DELETE /watchlist/{symbol}`

## Notes
- Business logic moved from the huge `main.py` into modular services; API behavior preserved.
- Backtests and streaming progress remain compatible. 