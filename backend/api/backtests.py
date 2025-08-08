from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from datetime import datetime
import asyncio
import json
import pandas as pd
from models.backtests import BacktestRequest
from services.serialization import make_json_serializable

router = APIRouter(prefix="", tags=["backtests"])

# In-memory job store reused from previous implementation
backtest_results: dict = {}


@router.post("/backtest/momentum")
async def run_momentum_backtest(request: BacktestRequest):
    try:
        from enhanced_backtest_strategy import EnhancedMomentumBacktester
        backtester = EnhancedMomentumBacktester(ticker=request.ticker.upper(), period=request.period, initial_capital=request.initial_capital)
        if not await backtester.fetch_data():
            raise HTTPException(status_code=404, detail=f"Could not fetch data for ticker '{request.ticker}'")
        if not await backtester.run_simulation():
            raise HTTPException(status_code=500, detail=f"Simulation failed for ticker '{request.ticker}'")
        results = make_json_serializable(backtester.generate_results())
        metrics = results.get("results", {})
        market_events = results.get("market_events", [])
        def safe_extract(value, default=0):
            if pd.isna(value) or value is None:
                return default
            if hasattr(value, 'item'):
                return value.item()
            return float(value) if isinstance(value, (int, float)) else default
        # Derive buy/sell signals
        buy_signals = [
            {"date": str(e.get("date", "")), "price": float(e.get("price", 0))}
            for e in market_events if isinstance(e, dict) and e.get("event_type") == "buy"
        ]
        sell_signals = [
            {"date": str(e.get("date", "")), "price": float(e.get("price", 0))}
            for e in market_events if isinstance(e, dict) and e.get("event_type") == "sell"
        ]
        response_data = {
            "success": True,
            "results": {
                "total_trades": int(safe_extract(metrics.get("total_trades", 0))),
                "winning_trades": int(safe_extract(metrics.get("winning_trades", 0))),
                "losing_trades": int(safe_extract(metrics.get("losing_trades", 0))),
                "win_rate": round(safe_extract(metrics.get("win_rate", 0)), 1),
                "total_pnl": round(safe_extract(metrics.get("total_pnl", 0)), 2),
                "total_return_pct": round(safe_extract(metrics.get("total_return_pct", 0)), 2),
                "avg_trade_pnl": round(safe_extract(metrics.get("avg_trade_pnl", 0)), 2),
                "avg_win": round(safe_extract(metrics.get("avg_win", 0)), 2),
                "avg_loss": round(abs(safe_extract(metrics.get("avg_loss", 0))), 2),
                "avg_holding_days": round(safe_extract(metrics.get("avg_holding_days", 0)), 1),
                "max_drawdown": round(safe_extract(metrics.get("max_drawdown", 0)), 2),
                "sharpe_ratio": round(safe_extract(metrics.get("sharpe_ratio", 0)), 2),
                "profit_factor": round(safe_extract(metrics.get("profit_factor", 0)), 2)
            },
            "trades": make_json_serializable(results.get("trades", [])),
            "price_data": make_json_serializable(results.get("price_data", [])),
            "momentum_periods": make_json_serializable(results.get("momentum_periods", [])),
            "buy_signals": buy_signals,
            "sell_signals": sell_signals,
            "market_events": make_json_serializable(market_events),
            "ticker": str(request.ticker.upper()),
            "period": str(request.period),
            "initial_capital": float(request.initial_capital),
            "chart_path": str(results.get("chart_path", ""))
        }
        return response_data
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Error running enhanced backtest: {str(e)}")


@router.post("/backtest/momentum/stream")
async def stream_momentum_backtest(request: BacktestRequest):
    async def generate():
        try:
            from enhanced_backtest_strategy import EnhancedMomentumBacktester
            yield f"data: {json.dumps({'type': 'status', 'message': f'Starting backtest for {request.ticker}', 'progress': 0})}\n\n"
            backtester = EnhancedMomentumBacktester(ticker=request.ticker.upper(), period=request.period, initial_capital=request.initial_capital)
            yield f"data: {json.dumps({'type': 'status', 'message': 'Fetching market data...', 'progress': 10})}\n\n"
            if not await backtester.fetch_data():
                yield f"data: {json.dumps({'type': 'error', 'message': f'Could not fetch data for ticker {request.ticker}'})}\n\n"
                return
            yield f"data: {json.dumps({'type': 'status', 'message': 'Data fetched successfully', 'progress': 30})}\n\n"
            yield f"data: {json.dumps({'type': 'status', 'message': 'Running simulation...', 'progress': 40})}\n\n"
            if not await backtester.run_simulation():
                yield f"data: {json.dumps({'type': 'error', 'message': f'Simulation failed for ticker {request.ticker}'})}\n\n"
                return
            yield f"data: {json.dumps({'type': 'status', 'message': 'Simulation completed', 'progress': 80})}\n\n"
            yield f"data: {json.dumps({'type': 'status', 'message': 'Generating results...', 'progress': 90})}\n\n"
            results = make_json_serializable(backtester.generate_results())
            metrics = results.get("results", {})
            market_events = results.get("market_events", [])
            def safe_extract(value, default=0):
                if pd.isna(value) or value is None:
                    return default
                if hasattr(value, 'item'):
                    return value.item()
                return float(value) if isinstance(value, (int, float)) else default
            buy_signals = [
                {"date": str(e.get("date", "")), "price": float(e.get("price", 0))}
                for e in market_events if isinstance(e, dict) and e.get("event_type") == "buy"
            ]
            sell_signals = [
                {"date": str(e.get("date", "")), "price": float(e.get("price", 0))}
                for e in market_events if isinstance(e, dict) and e.get("event_type") == "sell"
            ]
            response_data = {
                "type": "complete",
                "success": True,
                "results": {
                    "total_trades": int(safe_extract(metrics.get("total_trades", 0))),
                    "winning_trades": int(safe_extract(metrics.get("winning_trades", 0))),
                    "losing_trades": int(safe_extract(metrics.get("losing_trades", 0))),
                    "win_rate": round(safe_extract(metrics.get("win_rate", 0)), 1),
                    "total_pnl": round(safe_extract(metrics.get("total_pnl", 0)), 2),
                    "total_return_pct": round(safe_extract(metrics.get("total_return_pct", 0)), 2),
                    "avg_trade_pnl": round(safe_extract(metrics.get("avg_trade_pnl", 0)), 2),
                    "avg_win": round(safe_extract(metrics.get("avg_win", 0)), 2),
                    "avg_loss": round(abs(safe_extract(metrics.get("avg_loss", 0))), 2),
                    "avg_holding_days": round(safe_extract(metrics.get("avg_holding_days", 0)), 1),
                    "max_drawdown": round(safe_extract(metrics.get("max_drawdown", 0)), 2),
                    "sharpe_ratio": round(safe_extract(metrics.get("sharpe_ratio", 0)), 2),
                    "profit_factor": round(safe_extract(metrics.get("profit_factor", 0)), 2)
                },
                "trades": make_json_serializable(results.get("trades", [])),
                "price_data": make_json_serializable(results.get("price_data", [])),
                "momentum_periods": make_json_serializable(results.get("momentum_periods", [])),
                "buy_signals": buy_signals,
                "sell_signals": sell_signals,
                "market_events": make_json_serializable(market_events),
                "ticker": str(request.ticker.upper()),
                "period": str(request.period),
                "initial_capital": float(request.initial_capital),
                "chart_path": str(results.get("chart_path", ""))
            }
            yield f"data: {json.dumps(response_data)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': f'Error in streaming backtest: {str(e)}'})}\n\n"
    return StreamingResponse(generate(), media_type="text/plain", headers={
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
    })


@router.post("/backtest/momentum/progress")
async def start_momentum_backtest_with_progress(request: BacktestRequest):
    import uuid
    job_id = str(uuid.uuid4())
    backtest_results[job_id] = {
        "status": "starting",
        "progress": 0,
        "message": f"Starting backtest for {request.ticker}",
        "created_at": datetime.now().isoformat(),
        "ticker": request.ticker,
        "period": request.period,
        "initial_capital": request.initial_capital
    }
    asyncio.create_task(_run_background_backtest(job_id, request))
    return {"job_id": job_id, "status": "started"}


async def _run_background_backtest(job_id: str, request: BacktestRequest):
    try:
        from enhanced_backtest_strategy import EnhancedMomentumBacktester
        backtest_results[job_id].update({"status": "fetching_data", "progress": 5, "message": "Fetching market data..."})
        backtester = EnhancedMomentumBacktester(ticker=request.ticker.upper(), period=request.period, initial_capital=request.initial_capital)
        if not await backtester.fetch_data():
            backtest_results[job_id].update({"status": "error", "message": f"Could not fetch data for ticker {request.ticker}"})
            return
        backtest_results[job_id].update({"status": "running_simulation", "progress": 10, "message": "Starting simulation..."})

        def update_progress(progress: float, message: str):
            overall_progress = 10 + (progress * 0.85)
            backtest_results[job_id].update({"status": "running_simulation", "progress": round(overall_progress, 1), "message": message})

        if not await backtester.run_simulation(progress_callback=update_progress):
            backtest_results[job_id].update({"status": "error", "message": f"Simulation failed for ticker {request.ticker}"})
            return

        backtest_results[job_id].update({"status": "generating_results", "progress": 95, "message": "Generating results..."})
        results = make_json_serializable(backtester.generate_results())
        backtest_results[job_id].update({"status": "completed", "progress": 100, "message": "Backtest completed successfully", "results": results})
    except Exception as e:
        backtest_results[job_id].update({"status": "error", "message": f"Backtest failed: {str(e)}"})


@router.get("/backtest/progress/{job_id}")
async def get_backtest_progress(job_id: str):
    if job_id not in backtest_results:
        raise HTTPException(status_code=404, detail="Job not found")
    payload = backtest_results[job_id]
    return make_json_serializable(payload)


@router.post("/backtest/multi-symbol")
async def run_multi_symbol_backtest(request: dict):
    try:
        symbols = request.get("symbols", [])
        period = request.get("period", "1y")
        initial_capital = request.get("initial_capital", 10000.0)
        if not symbols:
            raise HTTPException(status_code=400, detail="No symbols provided")
        import uuid
        job_id = str(uuid.uuid4())
        backtest_results[job_id] = {
            "status": "running",
            "progress": 0,
            "message": "Starting multi-symbol backtest...",
            "created_at": datetime.now(),
            "symbols": symbols,
            "current_symbol": "",
            "individual_results": {},
            "combined_results": None
        }
        asyncio.create_task(_process_multi_symbol_backtest(job_id, symbols, period, initial_capital))
        return {"job_id": job_id, "message": f"Multi-symbol backtest started for {len(symbols)} symbols"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Multi-symbol backtest failed: {str(e)}")


async def _process_multi_symbol_backtest(job_id: str, symbols: list, period: str, initial_capital: float):
    try:
        from enhanced_backtest_strategy import EnhancedMomentumBacktester
        individual_results = {}
        for i, symbol in enumerate(symbols):
            try:
                backtest_results[job_id].update({
                    "progress": round((i / len(symbols)) * 100, 1),
                    "message": f"Testing {symbol}... ({i+1}/{len(symbols)})",
                    "current_symbol": symbol,
                    "symbols_completed": i,
                    "symbols_total": len(symbols),
                    "candle_progress": 0,
                    "candle_total": 0
                })
                backtester = EnhancedMomentumBacktester(ticker=symbol.upper(), period=period, initial_capital=initial_capital)
                fetch_result = await backtester.fetch_data()
                if not fetch_result:
                    individual_results[symbol] = {"success": False, "error": f"Could not fetch data for {symbol}", "results": {}, "trades": []}
                    continue
                def update_progress(progress: float, message: str):
                    try:
                        backtest_results[job_id].update({"candle_progress": round(progress, 1), "candle_total": 100, "message": f"{symbol}: {message}"})
                    except Exception:
                        pass
                simulation_result = await backtester.run_simulation(progress_callback=update_progress)
                if not simulation_result:
                    individual_results[symbol] = {"success": False, "error": f"Simulation failed for {symbol}", "results": {}, "trades": []}
                    continue
                results = backtester.generate_results()
                individual_results[symbol] = make_json_serializable({"success": True, "results": results.get("results", {}), "error": results.get("error")})
                backtest_results[job_id].update({
                    "progress": round(((i + 1) / len(symbols)) * 100, 1),
                    "message": f"Completed {symbol}... ({i+1}/{len(symbols)})",
                    "current_symbol": symbol,
                    "symbols_completed": i + 1,
                    "symbols_total": len(symbols),
                    "candle_progress": 100,
                    "candle_total": 100,
                    "live_results": make_json_serializable(results)
                })
            except Exception as e:
                individual_results[symbol] = {"success": False, "error": f"Error processing {symbol}: {str(e)}", "results": {}, "trades": []}
        # Combine results similar to legacy behavior
        backtest_results[job_id].update({
            "status": "completed",
            "progress": 100,
            "message": "Multi-symbol backtest completed successfully",
            "individual_results": individual_results,
            "combined_results": {"results": {}},
            "results": {"results": {}}
        })
    except Exception as e:
        backtest_results[job_id].update({"status": "error", "message": f"Multi-symbol backtest failed: {str(e)}"}) 