@echo off
cd /d "C:\Users\dhruv\strategy-developer-1\backend"
echo Starting backend server...
python -m uvicorn app.factory:create_app --reload --host 127.0.0.1 --port 8000
pause