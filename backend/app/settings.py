from pydantic import BaseSettings, Field
from typing import List


class Settings(BaseSettings):
    app_title: str = Field("Advanced Momentum Trading Strategy API", env="APP_TITLE")
    app_version: str = Field("2.1.0", env="APP_VERSION")

    # CORS
    cors_allow_origins: List[str] = Field(default_factory=lambda: ["*"])

    # Cache TTLs (seconds)
    nyse_ticker_cache_ttl: int = Field(60 * 60 * 12, env="NYSE_TICKER_CACHE_TTL")  # 12h
    sector_cache_ttl: int = Field(60 * 60 * 2, env="SECTOR_CACHE_TTL")  # 2h
    default_cache_ttl: int = Field(300, env="DEFAULT_CACHE_TTL")  # 5m

    # Network timeouts (seconds)
    yfinance_timeout: int = Field(8, env="YFINANCE_TIMEOUT")
    ext_call_timeout: int = Field(10, env="EXT_CALL_TIMEOUT")

    # Files
    watchlist_file: str = Field("backend/watchlist.json", env="WATCHLIST_FILE")
    watchlists_file: str = Field("backend/watchlists.json", env="WATCHLISTS_FILE")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8" 