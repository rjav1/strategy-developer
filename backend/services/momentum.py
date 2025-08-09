import numpy as np
import pandas as pd
from typing import Tuple, Dict, Any


def calculate_moving_averages(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df['SMA10'] = df['Close'].rolling(window=10).mean()
    df['SMA20'] = df['Close'].rolling(window=20).mean()
    df['SMA50'] = df['Close'].rolling(window=50).mean()
    df['SMA200'] = df['Close'].rolling(window=200).mean()
    return df


def calculate_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high_low = df['High'] - df['Low']
    high_close = np.abs(df['High'] - df['Close'].shift())
    low_close = np.abs(df['Low'] - df['Close'].shift())
    ranges = pd.concat([high_low, high_close, low_close], axis=1)
    true_range = ranges.max(axis=1)
    return true_range.rolling(window=period).mean()


def detect_momentum_move_boundaries(df: pd.DataFrame) -> tuple[int, int, float, dict]:
    if len(df) < 30:
        return -1, -1, 0.0, {}

    df = df.copy()
    if 'SMA10' not in df.columns:
        df['SMA10'] = df['Close'].rolling(window=10).mean()
    df['daily_range_pct'] = (df['High'] - df['Low']) / df['Open'] * 100
    df['ADR_20'] = df['daily_range_pct'].rolling(window=20).mean()
    df['volume_sma'] = df['Volume'].rolling(window=50).mean()

    df['price_change_pct'] = df['Close'].pct_change() * 100
    df['volume_ratio'] = df['Volume'] / df['volume_sma']
    df['momentum_5'] = df['Close'].pct_change(5) * 100
    df['momentum_10'] = df['Close'].pct_change(10) * 100

    current_adr = df['ADR_20'].iloc[-1] if not pd.isna(df['ADR_20'].iloc[-1]) else 5.0
    required_move = current_adr * 3

    lookback_days = min(45, len(df))
    recent_data = df.tail(lookback_days).copy()

    best_move = 0.0
    best_start = -1
    best_end = -1
    best_score = 0.0

    max_days_old = 25
    earliest_start = max(10, len(recent_data) - max_days_old)

    for potential_start in range(len(recent_data) - 5, earliest_start, -1):
        if potential_start < 10:
            continue
        lookback_period = min(10, potential_start)
        if lookback_period < 5:
            continue
        consol_start = potential_start - lookback_period
        consol_data = recent_data.iloc[consol_start:potential_start]

        consol_range = (consol_data['High'].max() - consol_data['Low'].min()) / consol_data['Open'].mean() * 100
        consol_volume_avg = consol_data['volume_ratio'].mean()
        consol_momentum_avg = consol_data['momentum_5'].abs().mean()
        consol_momentum_std = consol_data['momentum_5'].std()

        is_valid_consolidation = (
            consol_range < current_adr * 5.0 and
            consol_volume_avg < 1.5 and
            consol_momentum_avg < current_adr * 3.0 and
            consol_momentum_std < current_adr * 2.5
        )
        consolidation_quality_bonus = 3.0 if is_valid_consolidation else 1.0

        for potential_end in range(potential_start + 3, min(potential_start + 10, len(recent_data))):
            start_price = recent_data.iloc[potential_start]['Low']
            end_price = recent_data.iloc[potential_end]['High']
            if start_price <= 0:
                continue
            move_pct = ((end_price - start_price) / start_price) * 100
            move_duration = potential_end - potential_start + 1
            if move_pct < required_move or move_duration > 6:
                continue
            move_velocity = move_pct / move_duration
            min_velocity = current_adr * 0.6
            if move_velocity < min_velocity:
                continue

            move_data = recent_data.iloc[potential_start:potential_end+1]
            up_days = sum(1 for i in range(len(move_data)) if move_data.iloc[i]['price_change_pct'] > 0)
            up_ratio = up_days / len(move_data) if len(move_data) > 0 else 0

            avg_volume_ratio = move_data['volume_ratio'].mean()
            max_volume_ratio = move_data['volume_ratio'].max()
            if avg_volume_ratio < 1.2 or max_volume_ratio < 1.8:
                continue

            strong_momentum_days = sum(1 for i in range(len(move_data)) if move_data.iloc[i]['momentum_5'] > current_adr)
            momentum_consistency = strong_momentum_days / len(move_data)
            if momentum_consistency < 0.6:
                continue

            post_move_consolidation_bonus = 1.0
            post_move_days_available = len(recent_data) - potential_end - 1
            if post_move_days_available >= 5:
                post_move_end = min(potential_end + 10, len(recent_data) - 1)
                post_move_start = potential_end + 1
                if post_move_end > post_move_start:
                    post_move_data = recent_data.iloc[post_move_start:post_move_end+1]
                    post_range = (post_move_data['High'].max() - post_move_data['Low'].min()) / post_move_data['Close'].iloc[0] * 100
                    post_volume_avg = post_move_data['volume_ratio'].mean()
                    post_momentum_avg = post_move_data['momentum_5'].abs().mean()
                    has_post_consolidation = (
                        post_range < current_adr * 3.0 and
                        post_volume_avg < avg_volume_ratio * 0.8 and
                        post_momentum_avg < current_adr * 1.5
                    )
                    post_move_consolidation_bonus = 3.0 if has_post_consolidation else 0.3

            days_from_end = len(recent_data) - potential_end
            if days_from_end <= 7:
                recency_bonus = 2.5
            elif days_from_end <= 14:
                recency_bonus = 2.0
            elif days_from_end <= 21:
                recency_bonus = 1.5
            else:
                recency_bonus = 1.0

            velocity_score = move_velocity * 10.0
            volume_surge_score = max_volume_ratio * 5.0
            move_strength_score = move_pct * 3.0
            quality_score = (up_ratio * 0.3 + momentum_consistency * 0.7) * 20

            velocity_bonus = 1.0
            if move_velocity > current_adr * 1.5:
                velocity_bonus = 3.0
            elif move_velocity > current_adr * 1.0:
                velocity_bonus = 2.0

            duration_penalty = 2.0 if move_duration <= 3 else 1.5 if move_duration <= 5 else 1.0

            final_score = (velocity_score + volume_surge_score + move_strength_score + quality_score) * consolidation_quality_bonus * recency_bonus * velocity_bonus * duration_penalty * post_move_consolidation_bonus

            if final_score > best_score:
                best_score = final_score
                best_move = move_pct
                best_start = len(df) - lookback_days + potential_start
                best_end = len(df) - lookback_days + potential_end

    if best_start == -1 or best_end == -1:
        return -1, -1, 0.0, {}

    start_price = df.iloc[best_start]['Low']
    end_price = df.iloc[best_end]['High']
    total_move_pct = ((end_price - start_price) / start_price) * 100 if start_price > 0 else 0

    move_volume_avg = df.iloc[best_start:best_end+1]['volume_ratio'].mean()
    start_volume_ratio = df.iloc[best_start]['volume_ratio']
    end_volume_ratio = df.iloc[best_end]['volume_ratio']

    move_details = {
        'start_candle': best_start,
        'end_candle': best_end,
        'start_date': df.index[best_start].strftime('%Y-%m-%d') if hasattr(df.index[best_start], 'strftime') else str(df.index[best_start]),
        'end_date': df.index[best_end].strftime('%Y-%m-%d') if hasattr(df.index[best_end], 'strftime') else str(df.index[best_end]),
        'start_price': round(start_price, 2),
        'end_price': round(end_price, 2),
        'total_move_pct': round(total_move_pct, 2),
        'move_duration': best_end - best_start + 1,
        'start_volume_ratio': round(start_volume_ratio, 2),
        'end_volume_ratio': round(end_volume_ratio, 2),
        'avg_volume_ratio': round(move_volume_avg, 2),
        'required_move': round(required_move, 2),
        'adr_20': round(current_adr, 2),
        'move_score': round(best_score, 2)
    }

    return best_start, best_end, total_move_pct, move_details


def check_momentum_pattern(hist_data: pd.DataFrame, stock_symbol: str | None = None) -> tuple[bool, Dict[str, Any], float]:
    if len(hist_data) < 50:
        return False, {}, 0.0

    df = hist_data.copy()
    df['SMA10'] = df['Close'].rolling(window=10).mean()
    df['SMA20'] = df['Close'].rolling(window=20).mean()
    df['SMA50'] = df['Close'].rolling(window=50).mean()

    df['daily_range_pct'] = (df['High'] - df['Low']) / df['Open'] * 100
    df['ADR_20'] = df['daily_range_pct'].rolling(window=20).mean()
    df['volume_sma'] = df['Volume'].rolling(window=50).mean()

    criteria_met: Dict[str, Any] = {}
    criteria_details: Dict[str, Any] = {}

    start_candle, end_candle, move_pct, move_details = detect_momentum_move_boundaries(df)

    if start_candle != -1 and end_candle != -1:
        current_adr = df['ADR_20'].iloc[-1] if not pd.isna(df['ADR_20'].iloc[-1]) else 5.0
        number_of_move_candles = end_candle - start_candle + 1
        base_threshold = current_adr * 3

        criteria_met['criterion1'] = move_pct > base_threshold
        criteria_details['criterion1'] = {
            'met': criteria_met['criterion1'],
            'move_pct': round(move_pct, 2),
            'adr_20': round(current_adr, 2),
            'base_threshold': round(base_threshold, 2),
            'number_of_move_candles': number_of_move_candles,
            'start_candle': start_candle,
            'end_candle': end_candle,
            'move_details': move_details,
        }
    else:
        criteria_met['criterion1'] = False
        criteria_details['criterion1'] = {
            'met': False,
            'move_pct': 0,
            'adr_20': 0,
            'required_move': 0,
            'start_candle': -1,
            'end_candle': -1,
            'move_details': {},
        }

    current_adr_20 = df['ADR_20'].iloc[-1] if not pd.isna(df['ADR_20'].iloc[-1]) else 5.0
    consolidation_found, consolidation_details = (False, {})
    try:
        from services.consolidation import detect_consolidation_pattern_new
        consolidation_found, consolidation_details = detect_consolidation_pattern_new(df, start_candle, end_candle, current_adr_20)
    except Exception:
        pass

    criteria_met['criterion2_3'] = consolidation_found
    criteria_details['criterion2_3'] = consolidation_details

    if len(df) >= 50:
        current_price = df['Close'].iloc[-1]
        sma50 = df['SMA50'].iloc[-1]
        if not pd.isna(sma50) and sma50 > 0:
            criteria_met['criterion4'] = current_price > sma50
            deviation_pct = ((current_price - sma50) / sma50) * 100
            criteria_details['criterion4'] = {
                'met': criteria_met['criterion4'],
                'current_price': round(current_price, 2),
                'sma50': round(sma50, 2),
                'deviation_pct': round(deviation_pct, 2),
            }
        else:
            criteria_met['criterion4'] = False
            criteria_details['criterion4'] = {'met': False, 'current_price': 0, 'sma50': 0, 'deviation_pct': 0}
    else:
        criteria_met['criterion4'] = False
        criteria_details['criterion4'] = {'met': False, 'current_price': 0, 'sma50': 0, 'deviation_pct': 0}

    if len(df) >= 20:
        current_adr = df['ADR_20'].iloc[-1] if not pd.isna(df['ADR_20'].iloc[-1]) else 0
        adr_in_range = 3.0 <= current_adr <= 20.0
        criteria_met['criterion5'] = adr_in_range
        criteria_details['criterion5'] = {
            'met': adr_in_range,
            'adr_20': round(current_adr, 2),
            'min_adr': 3.0,
            'max_adr': 20.0,
        }
    else:
        criteria_met['criterion5'] = False
        criteria_details['criterion5'] = {'met': False, 'adr_20': 0, 'min_adr': 3.0, 'max_adr': 20.0}

    if len(df) >= 20:
        # Calculate average volume over recent period (last 20 days) - using ALL data
        recent_volume_data = df.tail(20)
        volume_data = recent_volume_data['Volume']
        price_data = recent_volume_data['Close']
        
        # Part 1: Standard volume calculation (using all data)
        avg_volume = volume_data.mean()
        avg_price = price_data.mean()
        avg_dollar_volume = avg_volume * avg_price
        volume_threshold = 1_000_000
        volume_meets_threshold = avg_dollar_volume >= volume_threshold
        
        # Part 2: Anomaly detection (flag if any anomalies exist)
        volume_mean = volume_data.mean()
        volume_std = volume_data.std()
        anomalies_detected = 0
        no_anomalies = True
        
        if volume_std > 0:
            z_scores = abs((volume_data - volume_mean) / volume_std)
            # Detect extreme volume spikes (Z-score > 3.0)
            anomaly_mask = z_scores > 3.0
            anomalies_detected = anomaly_mask.sum()
            no_anomalies = anomalies_detected == 0
        
        # Both parts must pass for criterion 6 to pass
        criteria_met['criterion6'] = volume_meets_threshold and no_anomalies
        
        criteria_details['criterion6'] = {
            'met': criteria_met['criterion6'],
            'volume_meets_threshold': volume_meets_threshold,
            'no_anomalies': no_anomalies,
            'avg_dollar_volume': round(avg_dollar_volume, 0),
            'threshold': volume_threshold,
            'avg_volume': round(avg_volume, 0),
            'avg_price': round(avg_price, 2),
            'anomalies_detected': int(anomalies_detected),
            'total_days_analyzed': len(recent_volume_data),
        }
    else:
        criteria_met['criterion6'] = False
        criteria_details['criterion6'] = {'met': False, 'volume_meets_threshold': False, 'no_anomalies': True, 'avg_dollar_volume': 0, 'threshold': 1_000_000, 'avg_volume': 0, 'avg_price': 0, 'anomalies_detected': 0, 'total_days_analyzed': 0}

    # Sector strength handled externally where needed

    total_criteria = 6
    criteria_met_count = sum(bool(v) for v in criteria_met.values())
    confidence_score = (criteria_met_count / total_criteria) * 100
    pattern_found = criteria_met_count >= 4

    return pattern_found, criteria_details, confidence_score 