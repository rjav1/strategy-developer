#!/usr/bin/env python3
"""
Simple server test
"""
import uvicorn
from main import app

if __name__ == "__main__":
    print("Starting server on port 8002...")
    try:
        uvicorn.run(app, host="0.0.0.0", port=8002, log_level="debug")
    except Exception as e:
        print(f"Server failed to start: {e}")
        import traceback
        traceback.print_exc()