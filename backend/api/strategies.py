from fastapi import APIRouter, HTTPException, UploadFile, File
from datetime import datetime

router = APIRouter(prefix="", tags=["strategies"])

# In-memory store for uploaded strategies
_strategies: dict[str, dict] = {}

# Load a built-in placeholder strategy name (frontend adds Momentum Screener separately)


@router.get("/strategies")
async def list_strategies():
    return list(_strategies.values())


@router.post("/strategies/upload")
async def upload_strategy(file: UploadFile = File(...)):
    if not file.filename.endswith('.py'):
        raise HTTPException(status_code=400, detail="Only Python files are allowed")
    content = await file.read()
    content_str = content.decode('utf-8', errors='ignore')
    if 'def generate_signals(' not in content_str:
        raise HTTPException(status_code=400, detail="Strategy must contain generate_signals function")
    strategy_id = f"strategy_{int(datetime.now().timestamp())}"
    _strategies[strategy_id] = {
        'id': strategy_id,
        'name': file.filename.replace('.py', ''),
        'content': content_str,
        'uploaded_at': datetime.now().isoformat()
    }
    return {"id": strategy_id, "name": _strategies[strategy_id]['name']} 