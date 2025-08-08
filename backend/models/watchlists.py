from pydantic import BaseModel
from typing import List, Optional


class WatchlistSymbol(BaseModel):
    symbol: str


class WatchlistResponse(BaseModel):
    symbols: List[str]


class WatchlistCreate(BaseModel):
    name: str
    description: Optional[str] = None


class WatchlistItem(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    symbols: List[str]
    created_at: str
    updated_at: str


class WatchlistsResponse(BaseModel):
    watchlists: List[WatchlistItem] 