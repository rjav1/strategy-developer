from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from typing import List, Optional
import json
import asyncio
import yfinance as yf
from models.screeners import ScreenResult
from services.momentum import check_momentum_pattern

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
    if symbols and len(symbols) > 0:
        symbols_to_screen = symbols
    else:
        symbols_to_screen = get_comprehensive_stock_list()

    results: List[ScreenResult] = []
    for symbol in symbols_to_screen:
        try:
            clean_symbol = symbol.replace('$', '').replace('/', '').replace('-', '').upper().strip()
            if not clean_symbol or len(clean_symbol) > 6:
                continue
            ticker = yf.Ticker(clean_symbol)
            hist = ticker.history(period="3mo")
            if hist.empty or len(hist) < 50:
                continue
            pattern_found, criteria_details, confidence_score = check_momentum_pattern(hist, clean_symbol)
            try:
                info = ticker.info
                company_name = info.get('longName', info.get('shortName', clean_symbol)) if info else clean_symbol
            except Exception:
                company_name = clean_symbol

            if confidence_score >= 80:
                strength = "Strong"
            elif confidence_score >= 60:
                strength = "Moderate"
            else:
                strength = "Weak"

            criteria_met = {
                'large_move': criteria_details.get('criterion1', {}).get('met', False),
                'consolidation': criteria_details.get('criterion2_3', {}).get('met', False),
                'above_50_sma': criteria_details.get('criterion4', {}).get('met', False),
                'adr_range': criteria_details.get('criterion5', {}).get('met', False),
                'avg_volume': criteria_details.get('criterion6', {}).get('met', False),
                'industry_strength': criteria_details.get('criterion7', {}).get('met', False),
            }
            total_met = sum(criteria_met.values())
            results.append(ScreenResult(symbol=clean_symbol, criteria_met=criteria_met, total_met=total_met, pattern_strength=strength, confidence_score=confidence_score, name=company_name))
        except Exception:
            continue
    sorted_results = sorted(results, key=lambda x: (x.total_met, x.pattern_strength), reverse=True)
    return sorted_results


@router.post("/screen_momentum_stream")
async def screen_momentum_stream(request: dict):
    async def generate():
        symbols: Optional[List[str]] = request.get('symbols')
        symbols_to_screen = symbols if symbols and len(symbols) > 0 else get_comprehensive_stock_list()
        total_symbols = len(symbols_to_screen)
        processed_count = 0
        yield f"data: {json.dumps({'type': 'progress', 'current': 0, 'total': total_symbols, 'percent': 0, 'current_symbol': 'Initializing...', 'message': 'Starting screening process...'})}\n\n"
        for symbol in symbols_to_screen:
            await asyncio.sleep(0)
            try:
                clean_symbol = symbol.replace('$', '').replace('/', '').replace('-', '').upper().strip()
                if not clean_symbol or len(clean_symbol) > 6:
                    processed_count += 1
                    percent = int((processed_count / total_symbols) * 100)
                    yield f"data: {json.dumps({'type': 'progress', 'current': processed_count, 'total': total_symbols, 'percent': percent, 'current_symbol': clean_symbol, 'message': f'Skipping invalid symbol: {clean_symbol}'})}\n\n"
                    continue
                
                # Send progress before processing
                percent = int((processed_count / total_symbols) * 100)
                yield f"data: {json.dumps({'type': 'progress', 'current': processed_count, 'total': total_symbols, 'percent': percent, 'current_symbol': clean_symbol, 'message': f'Analyzing {clean_symbol}...'})}\n\n"
                
                # Add timeout protection for Yahoo Finance API calls
                try:
                    ticker = yf.Ticker(clean_symbol)
                    hist = await asyncio.wait_for(
                        asyncio.get_event_loop().run_in_executor(
                            None, lambda: ticker.history(period="3mo", timeout=10)
                        ), 
                        timeout=15  # 15-second total timeout per symbol
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
                
                pattern_found, criteria_details, confidence_score = check_momentum_pattern(hist, clean_symbol)
                
                # Get company name with timeout protection
                try:
                    info = await asyncio.wait_for(
                        asyncio.get_event_loop().run_in_executor(
                            None, lambda: ticker.info
                        ), 
                        timeout=5  # 5-second timeout for company info
                    )
                    company_name = info.get('longName', info.get('shortName', clean_symbol)) if info else clean_symbol
                except (asyncio.TimeoutError, Exception):
                    company_name = clean_symbol
                if confidence_score >= 80:
                    strength = "Strong"
                elif confidence_score >= 60:
                    strength = "Moderate"
                else:
                    strength = "Weak"
                criteria_met = {
                    'large_move': criteria_details.get('criterion1', {}).get('met', False),
                    'consolidation': criteria_details.get('criterion2_3', {}).get('met', False),
                    'above_50_sma': criteria_details.get('criterion4', {}).get('met', False),
                    'adr_range': criteria_details.get('criterion5', {}).get('met', False),
                    'avg_volume': criteria_details.get('criterion6', {}).get('met', False),
                    'industry_strength': criteria_details.get('criterion7', {}).get('met', False)
                }
                total_met = sum(criteria_met.values())
                result = ScreenResult(symbol=clean_symbol, criteria_met=criteria_met, total_met=total_met, pattern_strength=strength, confidence_score=confidence_score, name=company_name)
                
                # Increment counter before sending completion message
                processed_count += 1
                percent = int((processed_count / total_symbols) * 100)
                
                if total_met >= 3 or request.get('include_bad_setups'):
                    yield f"data: {json.dumps({'type': 'result', 'result': result.dict(), 'current': processed_count, 'total': total_symbols, 'percent': percent, 'current_symbol': clean_symbol, 'message': 'Result'})}\n\n"
                else:
                    yield f"data: {json.dumps({'type': 'progress', 'current': processed_count, 'total': total_symbols, 'percent': percent, 'current_symbol': clean_symbol, 'message': f'No pattern found in {clean_symbol}'})}\n\n"
                    
            except Exception as e:
                processed_count += 1
                percent = int((processed_count / total_symbols) * 100)
                yield f"data: {json.dumps({'type': 'error', 'error': str(e), 'current': processed_count, 'total': total_symbols, 'percent': percent, 'current_symbol': symbol, 'message': f'Error processing {symbol}: {str(e)}'})}\n\n"
        yield f"data: {json.dumps({'type': 'complete', 'results': [], 'total_found': 0, 'message': 'Screening completed!'})}\n\n"
    return StreamingResponse(generate(), media_type="text/plain") 