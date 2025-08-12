import asyncio
import json
from enhanced_backtest_strategy import EnhancedMomentumBacktester


async def run_symbol(ticker: str, period: str = "1y", capital: float = 10000.0):
    bt = EnhancedMomentumBacktester(ticker=ticker, period=period, initial_capital=capital)
    if not await bt.fetch_data():
        print(f"❌ Fetch failed for {ticker}")
        return None
    if not await bt.run_simulation():
        print(f"❌ Simulation failed for {ticker}")
        return None
    res = bt.generate_results()
    pnl = res.get("results", {}).get("total_pnl")
    print(f"{ticker} PnL: {pnl}")
    return res


async def main():
    symbols = ["AMTX", "ATOM", "ADTN"]
    results = {}
    for s in symbols:
        results[s] = await run_symbol(s)
    print(json.dumps({k: (v.get("results", {}) if v else None) for k, v in results.items()}, indent=2))


if __name__ == "__main__":
    asyncio.run(main())


