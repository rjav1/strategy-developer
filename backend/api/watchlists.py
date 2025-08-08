from fastapi import APIRouter, HTTPException
from datetime import datetime
from typing import Optional
from models.watchlists import WatchlistsResponse, WatchlistItem, WatchlistCreate, WatchlistSymbol, WatchlistResponse
from repos.watchlists_repo import WatchlistsRepo
from api.ticker import get_ticker_data

router = APIRouter(prefix="", tags=["watchlists"])
repo = WatchlistsRepo()


@router.get("/watchlists", response_model=WatchlistsResponse)
async def get_watchlists():
    data = repo.load_watchlists()
    items = [WatchlistItem(**wl) for wl in data.get('watchlists', [])]
    return WatchlistsResponse(watchlists=items)


@router.post("/watchlists", response_model=WatchlistItem)
async def create_watchlist(watchlist_data: WatchlistCreate):
    data = repo.load_watchlists()
    existing = data.get('watchlists', [])
    for wl in existing:
        if wl.get('name', '').lower() == watchlist_data.name.lower():
            raise HTTPException(status_code=400, detail="Watchlist name already exists")
    import uuid
    new_id = str(uuid.uuid4())[:8]
    now = datetime.now().isoformat()
    new_wl = {
        'id': new_id,
        'name': watchlist_data.name.strip(),
        'description': watchlist_data.description.strip() if watchlist_data.description else None,
        'symbols': [],
        'created_at': now,
        'updated_at': now,
    }
    existing.append(new_wl)
    repo.save_watchlists({'watchlists': existing})
    return WatchlistItem(**new_wl)


@router.post("/watchlists/{watchlist_id}/symbols", response_model=WatchlistItem)
async def add_symbol_to_watchlist(watchlist_id: str, symbol_data: WatchlistSymbol):
    data = repo.load_watchlists()
    watchlists = data.get('watchlists', [])
    target = next((wl for wl in watchlists if wl.get('id') == watchlist_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    symbol = symbol_data.symbol.upper().strip()
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol cannot be empty")
    if 'symbols' not in target:
        target['symbols'] = []
    if symbol not in target['symbols']:
        target['symbols'].append(symbol)
        target['updated_at'] = datetime.now().isoformat()
        repo.save_watchlists({'watchlists': watchlists})
    return WatchlistItem(**target)


@router.delete("/watchlists/{watchlist_id}")
async def delete_watchlist(watchlist_id: str):
    data = repo.load_watchlists()
    watchlists = data.get('watchlists', [])
    updated = [wl for wl in watchlists if wl.get('id') != watchlist_id]
    if len(updated) == len(watchlists):
        raise HTTPException(status_code=404, detail="Watchlist not found")
    repo.save_watchlists({'watchlists': updated})
    return {"message": "Watchlist deleted successfully"}


@router.delete("/watchlists/{watchlist_id}/symbols/{symbol}", response_model=WatchlistItem)
async def remove_symbol_from_watchlist(watchlist_id: str, symbol: str):
    data = repo.load_watchlists()
    watchlists = data.get('watchlists', [])
    target = next((wl for wl in watchlists if wl.get('id') == watchlist_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    symbol = symbol.upper().strip()
    if symbol in target.get('symbols', []):
        target['symbols'].remove(symbol)
        target['updated_at'] = datetime.now().isoformat()
        repo.save_watchlists({'watchlists': watchlists})
    return WatchlistItem(**target)


@router.post("/watchlists/{watchlist_id}/update-prices")
async def update_watchlist_prices(watchlist_id: str):
    data = repo.load_watchlists()
    watchlists = data.get('watchlists', [])
    target = next((wl for wl in watchlists if wl.get('id') == watchlist_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    symbols = target.get('symbols', [])
    updated_prices = {}
    for symbol in symbols:
        try:
            resp = await get_ticker_data(symbol, "1d")
            updated_prices[symbol] = {
                'symbol': resp.symbol,
                'current_price': resp.current_price,
                'daily_change': resp.daily_change,
                'daily_change_percent': resp.daily_change_percent,
                'name': resp.name
            }
        except Exception as e:
            updated_prices[symbol] = None
    return {
        'watchlist_id': watchlist_id,
        'updated_prices': updated_prices,
        'timestamp': datetime.now().isoformat()
    }


# Legacy single watchlist
@router.get("/watchlist", response_model=WatchlistResponse)
async def get_watchlist():
    return WatchlistResponse(symbols=repo.load_watchlist())


@router.post("/watchlist", response_model=WatchlistResponse)
async def add_to_watchlist(symbol_data: WatchlistSymbol):
    symbols = repo.load_watchlist()
    symbol = symbol_data.symbol.upper().strip()
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol cannot be empty")
    if symbol not in symbols:
        symbols.append(symbol)
        repo.save_watchlist(symbols)
    return WatchlistResponse(symbols=symbols)


@router.delete("/watchlist/{symbol}", response_model=WatchlistResponse)
async def remove_from_watchlist(symbol: str):
    symbols = repo.load_watchlist()
    u = symbol.upper().strip()
    if u in symbols:
        symbols.remove(u)
        repo.save_watchlist(symbols)
    return WatchlistResponse(symbols=symbols) 