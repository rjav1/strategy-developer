from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from datetime import datetime
import asyncio
import json
from logging_manager import logging_manager, log_info, log_error
from services.serialization import make_json_serializable

router = APIRouter(prefix="", tags=["logs"])


@router.websocket("/ws/logs")
async def websocket_logs(websocket: WebSocket):
    client_ip = websocket.client.host if websocket.client else "unknown"
    try:
        await websocket.accept()
        log_info(f"New WebSocket client connected for log streaming from {client_ip}")
        subscriber_queue = logging_manager.subscribe()
        try:
            await websocket.send_text(json.dumps({"type": "connected", "message": "Log streaming active"}))
            recent_logs = logging_manager.get_logs(limit=50)
            for log_entry in recent_logs:
                await websocket.send_text(json.dumps({"type": "log", "data": log_entry.to_dict()}))

            while True:
                try:
                    log_entry = await asyncio.wait_for(subscriber_queue.get(), timeout=60)
                    log_dict = make_json_serializable(log_entry.to_dict())
                    await websocket.send_text(json.dumps({"type": "log", "data": log_dict}))
                except asyncio.TimeoutError:
                    await websocket.send_text(json.dumps({"type": "heartbeat", "timestamp": datetime.now().isoformat()}))
        except WebSocketDisconnect:
            log_info(f"WebSocket client from {client_ip} disconnected normally")
        finally:
            logging_manager.unsubscribe(subscriber_queue)
    except Exception as e:
        log_error(f"Failed to accept WebSocket connection from {client_ip}: {e}")
        try:
            await websocket.close(code=1011, reason="Internal server error")
        except Exception:
            pass


@router.get("/logs/stream")
async def sse_logs():
    async def generate():
        q = logging_manager.subscribe()
        try:
            for log_entry in logging_manager.get_logs(limit=50):
                yield f"data: {json.dumps({'type': 'log', 'data': make_json_serializable(log_entry.to_dict())})}\n\n"
            while True:
                try:
                    log_entry = await asyncio.wait_for(q.get(), timeout=30)
                    yield f"data: {json.dumps({'type': 'log', 'data': make_json_serializable(log_entry.to_dict())})}\n\n"
                except asyncio.TimeoutError:
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
        finally:
            logging_manager.unsubscribe(q)
    return StreamingResponse(generate(), media_type="text/plain", headers={
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
    })


@router.get("/logs")
async def get_logs(limit: int = 100):
    logs = [make_json_serializable(l.to_dict()) for l in logging_manager.get_logs(limit=limit)]
    return {"logs": logs, "total": len(logs)}


@router.delete("/logs")
async def clear_logs():
    logging_manager.clear_logs()
    log_info("Log history cleared")
    return {"message": "Logs cleared successfully"} 