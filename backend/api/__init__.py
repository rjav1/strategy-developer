from fastapi import APIRouter
from . import ticker, screeners, analytics, backtests, watchlists, logs, health, strategies

router = APIRouter()

router.include_router(health.router)
router.include_router(ticker.router)
router.include_router(screeners.router)
router.include_router(analytics.router)
router.include_router(backtests.router)
router.include_router(watchlists.router)
router.include_router(logs.router)
router.include_router(strategies.router) 