from datetime import datetime, date
from dataclasses import is_dataclass, asdict
from typing import Any
import numpy as np
import pandas as pd


def make_json_serializable(obj: Any):
    if isinstance(obj, dict):
        return {key: make_json_serializable(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [make_json_serializable(item) for item in obj]
    elif isinstance(obj, tuple):
        return [make_json_serializable(item) for item in obj]
    elif isinstance(obj, np.bool_):
        return bool(obj)
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        value = float(obj)
        if value != value or value == float('inf') or value == float('-inf'):
            return None
        return value
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, (datetime, date)):
        return obj.isoformat()
    elif pd.isna(obj):
        return None
    elif is_dataclass(obj):
        return make_json_serializable(asdict(obj))
    elif hasattr(obj, '__dict__'):
        return make_json_serializable(obj.__dict__)
    elif hasattr(obj, 'item'):
        return make_json_serializable(obj.item())
    else:
        if isinstance(obj, float):
            import math
            return None if not math.isfinite(obj) else obj
        return obj 