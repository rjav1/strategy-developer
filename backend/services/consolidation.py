import pandas as pd
from typing import Tuple, Dict, Any


def detect_consolidation_pattern_new(df: pd.DataFrame, move_start_idx: int, move_end_idx: int, adr_20: float | None = None) -> tuple[bool, dict]:
    if move_start_idx == -1 or move_end_idx == -1:
        return False, {}

    consolidation_start_idx = move_end_idx + 1
    if consolidation_start_idx >= len(df):
        return False, {}

    consolidation_data = df.iloc[consolidation_start_idx:]

    consolidation_candles = len(consolidation_data)
    if consolidation_candles < 3:
        return False, {
            'met': False,
            'reason': f'Only {consolidation_candles} candles in consolidation (need >= 3)',
            'consolidation_candles': consolidation_candles
        }

    move_data = df.iloc[move_start_idx:move_end_idx + 1]

    move_start_adr = ((df.iloc[move_start_idx]['High'] - df.iloc[move_start_idx]['Low']) / df.iloc[move_start_idx]['Open']) * 100

    first_consolidation_adr = ((consolidation_data.iloc[0]['High'] - consolidation_data.iloc[0]['Low']) / consolidation_data.iloc[0]['Open']) * 100
    first_candle_criterion_met = abs(first_consolidation_adr - move_start_adr) <= (adr_20 if adr_20 is not None else 5.0)

    move_daily_ranges = (move_data['High'] - move_data['Low']) / move_data['Open'] * 100
    move_avg_adr = move_daily_ranges.mean()

    if len(consolidation_data) > 1:
        consolidation_adr_data = consolidation_data.iloc[1:]
        consolidation_daily_ranges = abs(consolidation_adr_data['High'] - consolidation_adr_data['Low']) / consolidation_adr_data['Close'] * 100
    else:
        consolidation_daily_ranges = pd.Series([])

    rolling_validation_passed = True
    rolling_details = []
    actual_consolidation_end = len(consolidation_data) - 1  # Default to end of available data
    
    for period_end in range(3, len(consolidation_data) + 1):
        period_data = consolidation_data.iloc[:period_end]
        if len(period_data) > 1:
            period_adr_data = period_data.iloc[1:]
            period_adr = abs(period_adr_data['High'] - period_adr_data['Low']) / period_adr_data['Close'] * 100
            period_avg_adr = period_adr.mean()
        else:
            period_avg_adr = 0

        period_avg_volume = period_data['Volume'].mean()
        move_avg_volume = move_data['Volume'].mean()
        period_passes_adr = period_avg_adr < move_avg_adr
        period_passes_volume = period_avg_volume < move_avg_volume
        period_passes = period_passes_adr and period_passes_volume

        rolling_details.append({
            'period_end': period_end,
            'period_passes': period_passes,
            'period_adr': round(period_avg_adr, 2),
            'period_volume': round(period_avg_volume, 0)
        })

        # Track when consolidation criteria are no longer met
        if len(rolling_details) >= 2:
            prev_passed = rolling_details[-2]['period_passes']
            curr_passed = rolling_details[-1]['period_passes']
            if prev_passed and not curr_passed:
                # Consolidation criteria failed at this point
                # Check if it recovers in future periods
                recovery_found = False
                for future_end in range(period_end + 1, len(consolidation_data) + 1):
                    future_data = consolidation_data.iloc[:future_end]
                    if len(future_data) > 1:
                        future_adr_data = future_data.iloc[1:]
                        future_adr = abs(future_adr_data['High'] - future_adr_data['Low']) / future_adr_data['Close'] * 100
                        future_avg_adr = future_adr.mean()
                    else:
                        future_avg_adr = 0
                    future_avg_volume = future_data['Volume'].mean()
                    future_passes_adr = future_avg_adr < move_avg_adr
                    future_passes_volume = future_avg_volume < move_avg_volume
                    future_passes = future_passes_adr and future_passes_volume
                    if future_passes:
                        recovery_found = True
                        break
                
                if not recovery_found:
                    # Consolidation definitively ended here
                    actual_consolidation_end = period_end - 2  # End at the last passing period
                    rolling_validation_passed = False
                    break

    # Calculate final metrics using only the actual consolidation period
    actual_consolidation_data = consolidation_data.iloc[:actual_consolidation_end + 1]
    
    if len(actual_consolidation_data) > 1:
        actual_adr_data = actual_consolidation_data.iloc[1:]
        actual_consolidation_daily_ranges = abs(actual_adr_data['High'] - actual_adr_data['Low']) / actual_adr_data['Close'] * 100
        consolidation_avg_adr = actual_consolidation_daily_ranges.mean() if len(actual_consolidation_daily_ranges) > 0 else 0
    else:
        consolidation_avg_adr = 0
    
    consolidation_avg_volume = actual_consolidation_data['Volume'].mean()
    move_avg_volume = move_data['Volume'].mean()

    volume_criterion_met = consolidation_avg_volume < move_avg_volume
    range_criterion_met = consolidation_avg_adr < move_avg_adr

    first_consolidation_close = actual_consolidation_data.iloc[0]['Close']
    most_recent_close = actual_consolidation_data.iloc[-1]['Close']
    price_difference = abs(most_recent_close - first_consolidation_close)
    price_difference_adr = price_difference / first_consolidation_close * 100

    # New rule: During consolidation, price at close must never dip below 80% of the first consolidation close
    min_consolidation_close = actual_consolidation_data['Close'].min()
    min_close_pct_of_start = (min_consolidation_close / first_consolidation_close * 100) if first_consolidation_close != 0 else 0
    price_floor_criterion_met = min_consolidation_close >= first_consolidation_close * 0.8

    stability_threshold = adr_20 if adr_20 is not None else consolidation_avg_adr
    price_criterion_met = price_difference_adr <= stability_threshold

    # NEW RULE: All closes in consolidation must be above 50-day SMA; if SMA50 missing, treat as failure
    try:
        sma50_series = df['SMA50'] if 'SMA50' in df.columns else None
        if sma50_series is not None and len(actual_consolidation_data) > 0:
            closes = actual_consolidation_data['Close']
            sma50_subset = sma50_series.iloc[consolidation_start_idx:consolidation_start_idx + actual_consolidation_end + 1]
            sma50_ok = bool((closes > sma50_subset).all()) if len(sma50_subset) == len(closes) else False
        else:
            sma50_ok = False
    except Exception:
        sma50_ok = False

    consolidation_found = (
        len(actual_consolidation_data) >= 3 and
        first_candle_criterion_met and
        rolling_validation_passed and
        volume_criterion_met and
        range_criterion_met and
        price_criterion_met and
        price_floor_criterion_met and
        sma50_ok
    )

    consolidation_details = {
        'met': consolidation_found,
        'consolidation_candles': len(actual_consolidation_data),
        'consolidation_start_idx': consolidation_start_idx,
        'consolidation_end_idx': consolidation_start_idx + actual_consolidation_end,  # Actual end based on criteria
        'actual_consolidation_end_relative': actual_consolidation_end,
        'first_candle_criterion_met': first_candle_criterion_met,
        'first_consolidation_adr': round(first_consolidation_adr, 2),
        'move_start_adr': round(move_start_adr, 2),
        'rolling_validation_passed': rolling_validation_passed,
        'rolling_details': rolling_details,
        'move_avg_volume': round(move_avg_volume, 0),
        'consolidation_avg_volume': round(consolidation_avg_volume, 0),
        'volume_criterion_met': volume_criterion_met,
        'move_avg_adr': round(move_avg_adr, 2),
        'consolidation_avg_adr': round(consolidation_avg_adr, 2),
        'range_criterion_met': range_criterion_met,
        'price_difference_adr': round(price_difference_adr, 2),
        'price_criterion_met': price_criterion_met,
        'min_consolidation_close': round(min_consolidation_close, 2),
        'min_close_pct_of_start': round(min_close_pct_of_start, 2),
        'price_floor_criterion_met': price_floor_criterion_met,
        'sma50_all_closes_above': sma50_ok,
        'stability_threshold': round(stability_threshold, 2),
        'adr_20_used': adr_20 is not None,
        'first_consolidation_close': round(first_consolidation_close, 2),
        'most_recent_close': round(most_recent_close, 2),
        'description': (
            f"Enhanced Consolidation: {len(actual_consolidation_data)} days (ends at idx {consolidation_start_idx + actual_consolidation_end}), "
            f"first candle ADR {first_consolidation_adr:.1f}% vs move start {move_start_adr:.1f}%, "
            f"rolling validation {'PASSED' if rolling_validation_passed else 'FAILED'}, volume {consolidation_avg_volume:.0f} vs {move_avg_volume:.0f}, "
            f"ADR {consolidation_avg_adr:.1f}% vs {move_avg_adr:.1f}% (excluding first candle), close diff {price_difference_adr:.1f}% (≤{stability_threshold:.1f}%), "
            f"price floor {'PASSED' if price_floor_criterion_met else 'FAILED'} (start: ${first_consolidation_close:.2f}, floor: ${first_consolidation_close * 0.8:.2f}, lowest: ${min_consolidation_close:.2f}), "
            f"SMA50 rule {'PASSED' if sma50_ok else 'FAILED'}"
        )
    }

    return consolidation_found, consolidation_details 