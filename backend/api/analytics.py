from fastapi import APIRouter, HTTPException, Query
import yfinance as yf
import pandas as pd
import numpy as np
from models.screeners import MomentumAnalysisResult
from services.momentum import check_momentum_pattern
from services.consolidation import detect_consolidation_pattern_new

router = APIRouter(prefix="", tags=["analytics"])


@router.get("/analyze/momentum_pattern/{symbol}", response_model=MomentumAnalysisResult)
async def analyze_momentum_pattern(symbol: str, period: str = Query("3mo", regex="^(3mo|6mo|1y|2y|5y|max)$")):
    try:
        ticker = yf.Ticker(symbol.upper())
        hist = ticker.history(period=period)
        if hist.empty or len(hist) < 100:
            raise HTTPException(status_code=404, detail=f"Insufficient historical data for analysis of '{symbol}'")

        pattern_found, criteria_details, confidence_score = check_momentum_pattern(hist, symbol.upper())
        strength = "Strong" if confidence_score >= 80 else "Moderate" if confidence_score >= 60 else "Weak"

        # Normalize numpy bools to Python bools in criteria_details
        def normalize(obj):
            if isinstance(obj, dict):
                return {k: normalize(v) for k, v in obj.items()}
            if isinstance(obj, list):
                return [normalize(v) for v in obj]
            if isinstance(obj, np.bool_):
                return bool(obj)
            return obj
        criteria_details = normalize(criteria_details)

        move_boundaries = None
        if criteria_details.get('criterion1', {}).get('start_candle', -1) != -1:
            move_boundaries = {
                'start_candle': int(criteria_details['criterion1']['start_candle']),
                'end_candle': int(criteria_details['criterion1']['end_candle']),
                'move_details': criteria_details['criterion1'].get('move_details', {})
            }

        return MomentumAnalysisResult(
            symbol=symbol.upper(),
            pattern_found=bool(pattern_found),
            confidence_score=float(confidence_score),
            analysis_report=(
                f"Consolidation analysis: {('PASSED' if criteria_details.get('criterion2_3', {}).get('met', False) else 'FAILED')} - "
                f"{criteria_details.get('criterion2_3', {}).get('description', 'No details')}"
            ),
            chart_image_base64=None,
            criteria_details=criteria_details,
            total_criteria_met=int(sum(v.get('met', False) if isinstance(v, dict) else False for v in criteria_details.values())),
            pattern_strength=strength,
            criteria_met={
                'large_move': bool(criteria_details.get('criterion1', {}).get('met', False)),
                'consolidation': bool(criteria_details.get('criterion2_3', {}).get('met', False)),
                'above_50_sma': bool(criteria_details.get('criterion4', {}).get('met', False)),
                'adr_range': bool(criteria_details.get('criterion5', {}).get('met', False)),
                'avg_volume': bool(criteria_details.get('criterion6', {}).get('met', False)),
                'industry_strength': bool(criteria_details.get('criterion7', {}).get('met', False))
            },
            move_boundaries=move_boundaries
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing momentum pattern for '{symbol}': {str(e)}")


@router.get("/analyze/momentum_pattern_chart/{symbol}")
async def analyze_momentum_pattern_chart(symbol: str, period: str = Query("1y", regex="^(3mo|6mo|1y|2y|5y|max)$")):
    try:
        import plotly.graph_objects as go
        from plotly.subplots import make_subplots
        
        ticker = yf.Ticker(symbol.upper())
        hist = ticker.history(period=period)
        if hist.empty or len(hist) < 50:
            raise HTTPException(status_code=404, detail=f"Insufficient historical data for '{symbol}'")
        
        # Prepare data akin to backtester
        df = hist.copy()
        df.index = pd.to_datetime(df.index)
        df['SMA10'] = df['Close'].rolling(10).mean()
        df['SMA20'] = df['Close'].rolling(20).mean()
        df['SMA50'] = df['Close'].rolling(50).mean()
        df['daily_range_pct'] = (df['High'] - df['Low']) / df['Open'] * 100
        df['ADR_20'] = df['daily_range_pct'].rolling(window=20).mean()
        df['volume_sma'] = df['Volume'].rolling(window=50).mean()
        df['volume_ratio'] = df['Volume'] / df['volume_sma']
        df['momentum_5'] = df['Close'].pct_change(5) * 100
        
        # Detect ALL momentum moves and their consolidations DAY BY DAY like backtester
        momentum_spans: list[tuple[int,int]] = []
        consolidation_spans: list[tuple[int,int]] = []
        
        # Track state transitions like the backtester
        current_state = "NOT_IN_TRADE"  # NOT_IN_TRADE, MOMENTUM_DETECTED, CONSOLIDATION
        current_momentum_start = -1
        current_momentum_end = -1
        current_consolidation_start = -1
        
        n = len(df)
        
        for i in range(50, n):  # Start from index 50 to have enough history for patterns
            # Get data slice up to current point (like backtester does)
            data_slice = df.iloc[:i+1].copy()
            
            # Check for momentum pattern at current index
            from services.momentum import check_momentum_pattern
            
            pattern_found, criteria_details, confidence = check_momentum_pattern(data_slice, symbol)
            
            if current_state == "NOT_IN_TRADE":
                if pattern_found and confidence >= 60:
                    # Look for the momentum move boundaries in the data slice
                    from services.momentum import detect_momentum_move_boundaries
                    move_start_idx, move_end_idx, move_pct, move_details = detect_momentum_move_boundaries(data_slice)
                    if move_start_idx != -1 and move_end_idx != -1:
                        current_state = "MOMENTUM_DETECTED"
                        current_momentum_start = move_start_idx
                        current_momentum_end = move_end_idx
                        # Add momentum span (avoid duplicates)
                        duplicate = any(abs(start - move_start_idx) <= 2 and abs(end - move_end_idx) <= 2 
                                      for start, end in momentum_spans)
                        if not duplicate:
                            momentum_spans.append((move_start_idx, move_end_idx))
            
            elif current_state == "MOMENTUM_DETECTED":
                # Check if consolidation criteria are met RIGHT NOW
                if criteria_details and 'criterion2_3' in criteria_details:
                    consolidation_met = criteria_details['criterion2_3'].get('met', False)
                    if consolidation_met:
                        current_state = "CONSOLIDATION"
                        current_consolidation_start = i
                # If pattern fails, go back to not in trade
                elif not pattern_found or confidence < 60:
                    current_state = "NOT_IN_TRADE"
                    current_momentum_start = -1
                    current_momentum_end = -1
            
            elif current_state == "CONSOLIDATION":
                # Check if consolidation criteria are still met
                consolidation_still_valid = False
                if criteria_details and 'criterion2_3' in criteria_details:
                    consolidation_still_valid = criteria_details['criterion2_3'].get('met', False)
                
                if not consolidation_still_valid or not pattern_found or confidence < 60:
                    # Consolidation ended - add the consolidation span
                    if current_consolidation_start != -1:
                        consolidation_spans.append((current_consolidation_start, i - 1))
                    
                    # Reset state
                    current_state = "NOT_IN_TRADE"
                    current_momentum_start = -1
                    current_momentum_end = -1
                    current_consolidation_start = -1
        
        # Handle case where we end in consolidation
        if current_state == "CONSOLIDATION" and current_consolidation_start != -1:
            consolidation_spans.append((current_consolidation_start, n - 1))
        
        # Plotly chart styled closer to backtester
        fig = make_subplots(rows=2, cols=1, shared_xaxes=True, vertical_spacing=0.03, row_heights=[0.72, 0.28])
        fig.add_trace(go.Candlestick(x=df.index, open=df['Open'], high=df['High'], low=df['Low'], close=df['Close'], name='Price', increasing_line_color='#22c55e', decreasing_line_color='#ef4444', increasing_fillcolor='#22c55e', decreasing_fillcolor='#ef4444'), row=1, col=1)
        fig.add_trace(go.Scatter(x=df.index, y=df['SMA10'], name='SMA10', line=dict(color='#60a5fa')), row=1, col=1)
        fig.add_trace(go.Scatter(x=df.index, y=df['SMA20'], name='SMA20', line=dict(color='#f97316')), row=1, col=1)
        fig.add_trace(go.Scatter(x=df.index, y=df['SMA50'], name='SMA50', line=dict(color='#ef4444')), row=1, col=1)
        fig.add_trace(go.Bar(x=df.index, y=df['Volume'], name='Volume', marker_color='#64748b'), row=2, col=1)
        
        # Add shaded regions for ALL moves and consolidations
        for (s,e) in momentum_spans:
            fig.add_vrect(x0=df.index[s], x1=df.index[e], fillcolor="rgba(239,68,68,0.18)", line_width=0, layer="below", annotation_text="Momentum", annotation_position="top left")
        for (s,e) in consolidation_spans:
            fig.add_vrect(x0=df.index[s], x1=df.index[e], fillcolor="rgba(234,179,8,0.22)", line_width=0, layer="below", annotation_text="Consolidation", annotation_position="top left")
        
        fig.update_layout(
            template='plotly_dark',
            height=720,
            legend=dict(orientation='h', yanchor='bottom', y=1.02, xanchor='right', x=1),
            margin=dict(l=20, r=20, t=30, b=20),
            paper_bgcolor='#0b1220',
            plot_bgcolor='#0b1220'
        )
        chart_html = fig.to_html(full_html=False, include_plotlyjs='cdn', config=dict(displaylogo=False, modeBarButtonsToRemove=['lasso2d','select2d']))
        # Prepare spans as ISO date pairs for the scroller
        def idx_to_date(idx: int) -> str:
            return df.index[int(idx)].strftime('%Y-%m-%d')
        spans = {
            'momentum': [{ 'start_date': idx_to_date(s), 'end_date': idx_to_date(e) } for (s,e) in momentum_spans],
            'consolidation': [{ 'start_date': idx_to_date(s), 'end_date': idx_to_date(e) } for (s,e) in consolidation_spans]
        }
        return {"chart_html": chart_html, "spans": spans}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating chart for '{symbol}': {str(e)}") 