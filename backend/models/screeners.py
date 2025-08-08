from pydantic import BaseModel
from typing import Dict, Any, Optional, List


class ScreenResult(BaseModel):
    symbol: str
    criteria_met: Dict[str, bool]
    total_met: int
    pattern_strength: str
    confidence_score: float
    name: Optional[str] = None


class MomentumAnalysisResult(BaseModel):
    symbol: str
    pattern_found: bool
    confidence_score: float
    analysis_report: Optional[str] = None
    chart_image_base64: Optional[str] = None
    criteria_details: Optional[Dict[str, Any]] = None
    total_criteria_met: int
    pattern_strength: str
    criteria_met: Optional[Dict[str, bool]] = None
    move_boundaries: Optional[Dict[str, Any]] = None 