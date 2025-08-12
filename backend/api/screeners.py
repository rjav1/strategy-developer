from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from typing import List, Optional
import json
import asyncio
import yfinance as yf
from models.screeners import ScreenResult
from services.momentum import check_momentum_pattern
from services.serialization import make_json_serializable

router = APIRouter(prefix="", tags=["screeners"])


def get_comprehensive_stock_list() -> list[str]:
    # Temporary: import from existing main until moved to data repo
    try:
        from main import get_comprehensive_stock_list as legacy
        return legacy()
    except Exception:
        try:
            from backend.main import get_comprehensive_stock_list as legacy2
            return legacy2()
        except Exception:
            return []


@router.post("/screen_momentum", response_model=List[ScreenResult])
async def screen_momentum(request: dict):
    symbols: Optional[List[str]] = request.get('symbols')
    symbols_to_screen = symbols if symbols and len(symbols) > 0 else get_comprehensive_stock_list()
    min_criteria = int(request.get('min_criteria', 0))
    period = request.get('period', '6mo')
    top_n = int(request.get('top_n', 0) or 0)

    results: List[ScreenResult] = []
    for symbol in symbols_to_screen:
        try:
            clean_symbol = symbol.replace('$', '').replace('/', '').replace('-', '').upper().strip()
            if not clean_symbol or len(clean_symbol) > 6:
                continue
            ticker = yf.Ticker(clean_symbol)
            hist = ticker.history(period=period)
            if hist.empty or len(hist) < 50:
                continue
            pattern_found, criteria_details, confidence_score = check_momentum_pattern(hist, clean_symbol)
            try:
                info = ticker.info
                company_name = info.get('longName', info.get('shortName', clean_symbol)) if info else clean_symbol
            except:
                company_name = clean_symbol
            strength = 'Strong' if confidence_score >= 80 else 'Moderate' if confidence_score >= 60 else 'Weak'
            criteria_met = {
                'large_move': criteria_details.get('criterion1', {}).get('met', False),
                'consolidation': criteria_details.get('criterion2_3', {}).get('met', False),
                'above_50_sma': criteria_details.get('criterion4', {}).get('met', False),
                'adr_range': criteria_details.get('criterion5', {}).get('met', False),
                'avg_volume': criteria_details.get('criterion6', {}).get('met', False),
                'industry_strength': criteria_details.get('criterion7', {}).get('met', False)
            }
            total_met = sum(criteria_met.values())
            if total_met < min_criteria:
                continue
            result = ScreenResult(
                symbol=clean_symbol,
                criteria_met=criteria_met,
                total_met=total_met,
                pattern_strength=strength,
                confidence_score=confidence_score,
                name=company_name
            )
            results.append(result)
        except Exception:
            continue
    # Sort and cap top_n if requested
    results = sorted(results, key=lambda x: (x.total_met, x.pattern_strength), reverse=True)
    if top_n and top_n > 0:
        results = results[:top_n]
    return results


@router.post("/screen_momentum_stream")
async def screen_momentum_stream(request: dict):
    async def generate():
        symbols: Optional[List[str]] = request.get('symbols')
        symbols_to_screen = symbols if symbols and len(symbols) > 0 else get_comprehensive_stock_list()
        min_criteria = int(request.get('min_criteria', 0))
        period = request.get('period', '6mo')
        top_n = int(request.get('top_n', 0) or 0)
        total_symbols = len(symbols_to_screen)
        processed_count = 0
        yield f"data: {json.dumps({'type': 'progress', 'current': 0, 'total': total_symbols, 'percent': 0, 'current_symbol': 'Initializing...', 'message': 'Starting screening process...'})}\n\n"
        results: List[dict] = []
        for symbol in symbols_to_screen:
            await asyncio.sleep(0)
            try:
                clean_symbol = symbol.replace('$', '').replace('/', '').replace('-', '').upper().strip()
                if not clean_symbol or len(clean_symbol) > 6:
                    processed_count += 1
                    percent = int((processed_count / total_symbols) * 100)
                    yield f"data: {json.dumps({'type': 'progress', 'current': processed_count, 'total': total_symbols, 'percent': percent, 'current_symbol': clean_symbol, 'message': f'Skipping invalid symbol: {clean_symbol}'})}\n\n"
                    continue
                percent = int((processed_count / total_symbols) * 100)
                yield f"data: {json.dumps({'type': 'progress', 'current': processed_count, 'total': total_symbols, 'percent': percent, 'current_symbol': clean_symbol, 'message': f'Analyzing {clean_symbol}...'})}\n\n"
                # Fetch data with chosen period
                try:
                    ticker = yf.Ticker(clean_symbol)
                    hist = await asyncio.wait_for(
                        asyncio.get_event_loop().run_in_executor(None, lambda: ticker.history(period=period, timeout=10)),
                        timeout=15
                    )
                except asyncio.TimeoutError:
                    processed_count += 1
                    percent = int((processed_count / total_symbols) * 100)
                    yield f"data: {json.dumps({'type': 'progress', 'current': processed_count, 'total': total_symbols, 'percent': percent, 'current_symbol': clean_symbol, 'message': f'Timeout fetching data for {clean_symbol}'})}\n\n"
                    continue
                await asyncio.sleep(0)
                if hist.empty or len(hist) < 50:
                    processed_count += 1
                    percent = int((processed_count / total_symbols) * 100)
                    yield f"data: {json.dumps({'type': 'progress', 'current': processed_count, 'total': total_symbols, 'percent': percent, 'current_symbol': clean_symbol, 'message': f'Insufficient data for {clean_symbol}'})}\n\n"
                    continue
                # Analyze pattern
                pattern_found, criteria_details, confidence_score = await asyncio.wait_for(
                    asyncio.get_event_loop().run_in_executor(None, lambda: check_momentum_pattern(hist, clean_symbol)),
                    timeout=10
                )
                # Strength
                strength = 'Strong' if confidence_score >= 80 else 'Moderate' if confidence_score >= 60 else 'Weak'
                criteria_met = {
                    'large_move': criteria_details.get('criterion1', {}).get('met', False),
                    'consolidation': criteria_details.get('criterion2_3', {}).get('met', False),
                    'above_50_sma': criteria_details.get('criterion4', {}).get('met', False),
                    'adr_range': criteria_details.get('criterion5', {}).get('met', False),
                    'avg_volume': criteria_details.get('criterion6', {}).get('met', False),
                    'industry_strength': criteria_details.get('criterion7', {}).get('met', False)
                }
                total_met = int(sum(criteria_met.values()))
                # Filter by min criteria
                if total_met >= min_criteria:
                    result = {
                        'symbol': clean_symbol,
                        'criteria_met': criteria_met,
                        'total_met': total_met,
                        'pattern_strength': strength,
                        'confidence_score': confidence_score,
                        'highlights': criteria_details.get('highlights', {})  # optional spans from analyzer
                    }
                    results.append(result)
                    # Sort and optionally cap
                    sorted_results = sorted(results, key=lambda x: (x['total_met'], x['pattern_strength']), reverse=True)
                    if top_n and len(sorted_results) > top_n:
                        sorted_results = sorted_results[:top_n]
                    yield f"data: {json.dumps({'type': 'result', 'result': sorted_results[-1] if not top_n else sorted_results[-1]})}\n\n"
                processed_count += 1
                percent = int((processed_count / total_symbols) * 100)
            except Exception:
                processed_count += 1
                percent = int((processed_count / total_symbols) * 100)
            finally:
                yield f"data: {json.dumps({'type': 'progress', 'current': processed_count, 'total': total_symbols, 'percent': percent, 'current_symbol': clean_symbol, 'message': f'Processed {processed_count}/{total_symbols}'})}\n\n"
        # Completion event with full sorted list
        sorted_results = sorted(results, key=lambda x: (x['total_met'], x['pattern_strength']), reverse=True)
        if top_n and len(sorted_results) > top_n:
            sorted_results = sorted_results[:top_n]
        yield f"data: {json.dumps({'type': 'complete', 'results': make_json_serializable(sorted_results)})}\n\n"
    return StreamingResponse(generate(), media_type="text/plain") 