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
# Cancellation flags per job
_cancel_flags: dict[str, bool] = {}


def _compute_cumulative_metrics(individual_results: dict, initial_capital: float) -> dict:
    # Aggregate portfolio-wide metrics across all completed symbols so far
    totals = {
        "total_trades": 0,
        "winning_trades": 0,
        "losing_trades": 0,
        "total_pnl": 0.0,
    }
    best_symbol = None
    best_pnl = float('-inf')
    worst_symbol = None
    worst_pnl = float('inf')
    profitable_symbols = 0
    unprofitable_symbols = 0
    symbols_passed = 0
    win_list = []
    loss_list = []

    for symbol, payload in individual_results.items():
        if not isinstance(payload, dict):
            continue
        res = payload.get("results", {}) or {}
        status = payload.get("status", "completed" if res else payload.get("error") and "failed" or "no_trades")
        if status == "failed":
            continue
        symbols_passed += 1
        trades = int(res.get("total_trades", 0) or 0)
        wins = int(res.get("winning_trades", 0) or 0)
        losses = int(res.get("losing_trades", 0) or 0)
        pnl = float(res.get("total_pnl", 0) or 0)
        totals["total_trades"] += trades
        totals["winning_trades"] += wins
        totals["losing_trades"] += losses
        totals["total_pnl"] += pnl
        # Build win/loss lists from per-symbol trades if available
        for t in (payload.get("trades") or []):
            try:
                p = float(t.get("pnl", 0))
                if p > 0:
                    win_list.append(p)
                elif p < 0:
                    loss_list.append(p)
            except Exception:
                pass
        if pnl > best_pnl:
            best_pnl = pnl
            best_symbol = symbol
        if pnl < worst_pnl:
            worst_pnl = pnl
            worst_symbol = symbol
        if pnl > 0:
            profitable_symbols += 1
        elif pnl < 0:
            unprofitable_symbols += 1

    # Portfolio equity relative to the single starting capital
    starting_capital = float(initial_capital)
    portfolio_capital = starting_capital + totals["total_pnl"]
    win_rate = (totals["winning_trades"] / max(1, totals["total_trades"]) * 100) if totals["total_trades"] > 0 else 0.0
    total_return_pct = (totals["total_pnl"] / starting_capital * 100) if starting_capital > 0 else 0.0
    avg_win = sum(win_list) / len(win_list) if win_list else 0.0
    avg_loss = sum(loss_list) / len(loss_list) if loss_list else 0.0

    return {
        **totals,
        "win_rate": round(win_rate, 2),
        "total_return_pct": round(total_return_pct, 2),
        "symbols_passed": symbols_passed,
        "profitable_symbols": profitable_symbols,
        "unprofitable_symbols": unprofitable_symbols,
        "best_symbol": best_symbol,
        "best_symbol_pnl": best_pnl if best_symbol is not None else 0.0,
        "worst_symbol": worst_symbol,
        "worst_symbol_pnl": worst_pnl if worst_symbol is not None else 0.0,
        "total_initial_capital": starting_capital,
        "portfolio_capital": portfolio_capital,
        "avg_win": avg_win,
        "avg_loss": avg_loss,
    }


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
            "entries": make_json_serializable(results.get("entries", [])),
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
                "entries": make_json_serializable(results.get("entries", [])),
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
        symbols = request.get("symbols")
        period = request.get("period", "1y")
        initial_capital = request.get("initial_capital", 10000.0)

        # If no symbols provided, default to full market list (same behavior as screener)
        if not symbols or len(symbols) == 0:
            try:
                from main import get_comprehensive_stock_list as legacy
                symbols = legacy()
            except Exception:
                try:
                    from backend.main import get_comprehensive_stock_list as legacy2
                    symbols = legacy2()
                except Exception:
                    raise HTTPException(status_code=400, detail="No symbols provided and full market list unavailable")

        import uuid
        job_id = str(uuid.uuid4())
        backtest_results[job_id] = {
            "status": "running",
            "progress": 0,
            "message": "Starting multi-symbol backtest...",
            "created_at": datetime.now(),
            "symbols": symbols,
            "current_symbol": "",
            "symbols_completed": 0,
            "symbols_total": len(symbols),
            "individual_results": {},
            "combined_results": None,
            "live_results": None
        }
        _cancel_flags[job_id] = False
        asyncio.create_task(_process_multi_symbol_backtest(job_id, symbols, period, initial_capital))
        return {"job_id": job_id, "message": f"Multi-symbol backtest started for {len(symbols)} symbols"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Multi-symbol backtest failed: {str(e)}")


@router.post("/backtest/multi-symbol/{job_id}/cancel")
async def cancel_multi_symbol_backtest(job_id: str):
    if job_id not in backtest_results:
        raise HTTPException(status_code=404, detail="Job not found")
    _cancel_flags[job_id] = True
    backtest_results[job_id].update({"status": "cancelled", "message": "Cancellation requested"})
    return {"status": "ok"}


async def _process_multi_symbol_backtest(job_id: str, symbols: list, period: str, initial_capital: float):
    """Background task to process multi-symbol backtest with improved error handling and rate limiting"""
    try:
        from enhanced_backtest_strategy import EnhancedMomentumBacktester
        import asyncio
        
        individual_results = {}
        total_symbols = len(symbols)
        running_portfolio_capital = float(initial_capital)
        
        for i, symbol in enumerate(symbols):
            # Respect cancel requests
            if _cancel_flags.get(job_id):
                backtest_results[job_id].update({
                    "status": "cancelled",
                    "message": "Backtest cancelled by user",
                    "symbols_completed": i,
                    "symbols_total": total_symbols
                })
                break
            try:
                # Update progress at start of each symbol
                backtest_results[job_id].update({
                    "progress": round((i / total_symbols) * 100, 1),
                    "message": f"Testing {symbol}... ({i+1}/{total_symbols})",
                    "current_symbol": symbol,
                    "symbols_completed": i,
                    "symbols_total": total_symbols,
                    "candle_progress": 0,
                    "candle_total": 0
                })
                
                # Rate limit
                if i > 0:
                    await asyncio.sleep(0.5)
                
                # Initialize with current portfolio capital
                try:
                    backtester = EnhancedMomentumBacktester(
                        ticker=symbol.upper(), 
                        period=period, 
                        initial_capital=running_portfolio_capital
                    )
                except Exception as init_error:
                    individual_results[symbol] = {
                        "success": False, 
                        "status": "failed",
                        "error": f"Failed to initialize backtester: {str(init_error)}", 
                        "results": {}, 
                        "trades": []
                    }
                    cumulative = _compute_cumulative_metrics(individual_results, initial_capital)
                    backtest_results[job_id].update({
                        "individual_results": make_json_serializable(individual_results),
                        "live_results": {"results": make_json_serializable(cumulative)}
                    })
                    continue
                
                # Fetch data
                try:
                    fetch_result = await asyncio.wait_for(backtester.fetch_data(), timeout=30)
                except asyncio.TimeoutError:
                    individual_results[symbol] = {
                        "success": False, 
                        "status": "failed",
                        "error": f"Timeout fetching data for {symbol}", 
                        "results": {}, 
                        "trades": []
                    }
                    cumulative = _compute_cumulative_metrics(individual_results, initial_capital)
                    backtest_results[job_id].update({
                        "individual_results": make_json_serializable(individual_results),
                        "live_results": {"results": make_json_serializable(cumulative)}
                    })
                    continue
                except Exception as fetch_error:
                    individual_results[symbol] = {
                        "success": False, 
                        "status": "failed",
                        "error": f"Could not fetch data for {symbol}: {str(fetch_error)}", 
                        "results": {}, 
                        "trades": []
                    }
                    cumulative = _compute_cumulative_metrics(individual_results, initial_capital)
                    backtest_results[job_id].update({
                        "individual_results": make_json_serializable(individual_results),
                        "live_results": {"results": make_json_serializable(cumulative)}
                    })
                    continue
                
                if not fetch_result:
                    individual_results[symbol] = {
                        "success": False, 
                        "status": "failed",
                        "error": f"Could not fetch data for {symbol} - no data returned", 
                        "results": {}, 
                        "trades": []
                    }
                    cumulative = _compute_cumulative_metrics(individual_results, initial_capital)
                    backtest_results[job_id].update({
                        "individual_results": make_json_serializable(individual_results),
                        "live_results": {"results": make_json_serializable(cumulative)}
                    })
                    continue
                
                # Define progress callback
                def update_progress(progress: float, message: str):
                    try:
                        backtest_results[job_id].update({
                            "candle_progress": round(progress, 1), 
                            "candle_total": 100, 
                            "message": f"{symbol}: {message}"
                        })
                    except Exception:
                        pass
                
                # Run simulation
                try:
                    simulation_result = await asyncio.wait_for(backtester.run_simulation(progress_callback=update_progress), timeout=60)
                except asyncio.TimeoutError:
                    individual_results[symbol] = {
                        "success": False, 
                        "status": "failed",
                        "error": f"Timeout during simulation for {symbol}", 
                        "results": {}, 
                        "trades": []
                    }
                    cumulative = _compute_cumulative_metrics(individual_results, initial_capital)
                    backtest_results[job_id].update({
                        "individual_results": make_json_serializable(individual_results),
                        "live_results": {"results": make_json_serializable(cumulative)}
                    })
                    continue
                except Exception as sim_error:
                    individual_results[symbol] = {
                        "success": False, 
                        "status": "failed",
                        "error": f"Simulation failed for {symbol}: {str(sim_error)}", 
                        "results": {}, 
                        "trades": []
                    }
                    cumulative = _compute_cumulative_metrics(individual_results, initial_capital)
                    backtest_results[job_id].update({
                        "individual_results": make_json_serializable(individual_results),
                        "live_results": {"results": make_json_serializable(cumulative)}
                    })
                    continue
                
                if not simulation_result:
                    individual_results[symbol] = {
                        "success": False, 
                        "status": "failed",
                        "error": f"Simulation failed for {symbol} - no result returned", 
                        "results": {}, 
                        "trades": []
                    }
                    cumulative = _compute_cumulative_metrics(individual_results, initial_capital)
                    backtest_results[job_id].update({
                        "individual_results": make_json_serializable(individual_results),
                        "live_results": {"results": make_json_serializable(cumulative)}
                    })
                    continue
                
                # Generate results
                try:
                    results = backtester.generate_results()
                    trade_stats = results.get("results", {})
                    total_trades = int(trade_stats.get("total_trades", 0) or 0)
                    status = "no_trades" if total_trades == 0 else "completed"
                    individual_results[symbol] = make_json_serializable({
                        "success": True, 
                        "status": status,
                        "results": trade_stats, 
                        "error": results.get("error"),
                        "trades": results.get("trades", []),
                        "entries": results.get("entries", [])
                    })
                    # Update running portfolio capital by adding this symbol's P&L
                    running_portfolio_capital += float(trade_stats.get("total_pnl", 0) or 0)
                except Exception as results_error:
                    individual_results[symbol] = {
                        "success": False, 
                        "status": "failed",
                        "error": f"Failed to generate results for {symbol}: {str(results_error)}", 
                        "results": {}, 
                        "trades": []
                    }
                
                # Update progress and publish cumulative snapshot
                cumulative = _compute_cumulative_metrics(individual_results, initial_capital)
                backtest_results[job_id].update({
                    "progress": round(((i + 1) / total_symbols) * 100, 1),
                    "message": f"Completed {symbol}... ({i+1}/{total_symbols})",
                    "current_symbol": symbol,
                    "symbols_completed": i + 1,
                    "symbols_total": total_symbols,
                    "candle_progress": 100,
                    "candle_total": 100,
                    "individual_results": make_json_serializable(individual_results),
                    "live_results": {"results": make_json_serializable({**cumulative, "portfolio_capital": running_portfolio_capital})}
                })
            except Exception as symbol_error:
                individual_results[symbol] = {
                    "success": False, 
                    "status": "failed",
                    "error": f"Error processing {symbol}: {str(symbol_error)}", 
                    "results": {}, 
                    "trades": []
                }
                cumulative = _compute_cumulative_metrics(individual_results, initial_capital)
                backtest_results[job_id].update({
                    "individual_results": make_json_serializable(individual_results),
                    "live_results": {"results": make_json_serializable(cumulative)}
                })
                continue
        
        # If cancelled, finalize payload without marking completed
        if _cancel_flags.get(job_id):
            backtest_results[job_id].update({
                "status": "cancelled",
                "message": "Backtest cancelled by user",
                "individual_results": make_json_serializable(individual_results),
                "results": {"results": make_json_serializable(_compute_cumulative_metrics(individual_results, initial_capital))}
            })
            return
        
        # Final summary
        successful_symbols = [s for s, r in individual_results.items() if r.get("success", False)]
        failed_symbols = [s for s, r in individual_results.items() if not r.get("success", False)]
        combined = _compute_cumulative_metrics(individual_results, initial_capital)
        backtest_results[job_id].update({
            "status": "completed",
            "progress": 100,
            "message": f"Multi-symbol backtest completed! {len(successful_symbols)}/{total_symbols} successful",
            "individual_results": make_json_serializable(individual_results),
            "combined_results": {"success": True, "results": make_json_serializable(combined)},
            "results": {"success": True, "results": make_json_serializable(combined)},
            "success": True,
            "summary": {
                "total_symbols": total_symbols,
                "successful_symbols": len(successful_symbols),
                "failed_symbols": len(failed_symbols),
                "success_rate": round((len(successful_symbols) / total_symbols) * 100, 1) if total_symbols > 0 else 0
            }
        })
        
    except Exception as e:
        backtest_results[job_id].update({
            "status": "error", 
            "message": f"Multi-symbol backtest failed: {str(e)}",
            "error_details": str(e)
        }) 