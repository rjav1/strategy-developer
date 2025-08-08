@echo off
echo Starting Trading Strategy Tester Backend...
echo.
cd backend
echo Current directory: %cd%
echo.
echo Installing/checking dependencies...
pip install -r requirements.txt
echo.
echo Starting FastAPI server on port 8000...
echo Backend running on: http://localhost:8000
echo.
echo Press Ctrl+C to stop the server
echo =======================================
python -m uvicorn app.factory:create_app --reload --host 0.0.0.0 --port 8000