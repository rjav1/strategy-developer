from __future__ import annotations
import json
from pathlib import Path
from typing import Dict, Any
from app.settings import Settings


class WatchlistsRepo:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or Settings()
        self.watchlist_file = Path(self.settings.watchlist_file)
        self.watchlists_file = Path(self.settings.watchlists_file)

    def load_watchlist(self) -> list[str]:
        try:
            if self.watchlist_file.exists():
                with open(self.watchlist_file, 'r') as f:
                    data = json.load(f)
                    return data.get('symbols', [])
            return []
        except Exception:
            return []

    def save_watchlist(self, symbols: list[str]) -> None:
        data = {'symbols': symbols}
        with open(self.watchlist_file, 'w') as f:
            json.dump(data, f, indent=2)

    def load_watchlists(self) -> Dict[str, Any]:
        try:
            if self.watchlists_file.exists():
                with open(self.watchlists_file, 'r') as f:
                    return json.load(f)
            return {'watchlists': []}
        except Exception:
            return {'watchlists': []}

    def save_watchlists(self, watchlists: Dict[str, Any]) -> None:
        with open(self.watchlists_file, 'w') as f:
            json.dump(watchlists, f, indent=2) 