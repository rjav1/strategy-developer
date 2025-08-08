from fastapi import APIRouter, HTTPException, Query
import yfinance as yf
import pandas as pd
from models.screeners import MomentumAnalysisResult
from services.momentum import check_momentum_pattern

router = APIRouter(prefix="", tags=["analytics"])


@router.get("/analyze/momentum_pattern/{symbol}", response_model=MomentumAnalysisResult)
async def analyze_momentum_pattern(symbol: str, period: str = Query("3mo", regex="^(3mo|6mo|1y|2y|5y|max)$")):
    ticker = yf.Ticker(symbol.upper())
    hist = ticker.history(period=period)
    if hist.empty or len(hist) < 100:
        raise HTTPException(status_code=404, detail=f"Insufficient historical data for analysis of '{symbol}'")

    pattern_found, criteria_details, confidence_score = check_momentum_pattern(hist, symbol.upper())
    if confidence_score >= 80:
        strength = "Strong"
    elif confidence_score >= 60:
        strength = "Moderate"
    else:
        strength = "Weak"

    # Keep chart as None to avoid heavyweight HTML generation here; frontend already plots price
    move_boundaries = None
    if criteria_details.get('criterion1', {}).get('start_candle', -1) != -1:
        move_boundaries = {
            'start_candle': criteria_details['criterion1']['start_candle'],
            'end_candle': criteria_details['criterion1']['end_candle'],
            'move_details': criteria_details['criterion1'].get('move_details', {})
        }

    return MomentumAnalysisResult(
        symbol=symbol.upper(),
        pattern_found=pattern_found,
        confidence_score=confidence_score,
        analysis_report=None,
        chart_image_base64=None,
        criteria_details=None,
        total_criteria_met=sum(v.get('met', False) if isinstance(v, dict) else False for v in criteria_details.values()),
        pattern_strength=strength,
        criteria_met={
            'large_move': criteria_details.get('criterion1', {}).get('met', False),
            'consolidation': criteria_details.get('criterion2_3', {}).get('met', False),
            'above_50_sma': criteria_details.get('criterion4', {}).get('met', False),
            'adr_range': criteria_details.get('criterion5', {}).get('met', False),
            'avg_volume': criteria_details.get('criterion6', {}).get('met', False),
            'industry_strength': criteria_details.get('criterion7', {}).get('met', False)
        },
        move_boundaries=move_boundaries
    ) 