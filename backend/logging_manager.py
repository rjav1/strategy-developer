"""
Real-time logging manager for streaming backtest logs to frontend

Features:
- Structured logging with levels (INFO, WARN, ERROR, DEBUG)
- WebSocket/SSE streaming support
- Color-coded log levels
- Thread-safe logging queue
- Automatic log cleanup
"""

import logging
import json
import asyncio
from datetime import datetime
from typing import Dict, Any, List, Optional
from enum import Enum
from dataclasses import dataclass, asdict
from queue import Queue, Empty
import threading


class LogLevel(Enum):
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARN = "WARN"
    ERROR = "ERROR"


@dataclass
class LogEntry:
    timestamp: str
    level: LogLevel
    message: str
    context: Optional[Dict[str, Any]] = None
    module: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        # Convert context to JSON-serializable format
        context = self.context or {}
        if context:
            try:
                # Import here to avoid circular imports
                import numpy as np
                import pandas as pd
                
                def convert_numpy_types(obj):
                    if isinstance(obj, np.bool_):
                        return bool(obj)
                    elif isinstance(obj, np.integer):
                        return int(obj)
                    elif isinstance(obj, np.floating):
                        return float(obj)
                    elif isinstance(obj, np.ndarray):
                        return obj.tolist()
                    elif isinstance(obj, pd.Series):
                        return obj.tolist()
                    elif isinstance(obj, pd.DataFrame):
                        return obj.to_dict('records')
                    elif isinstance(obj, dict):
                        return {k: convert_numpy_types(v) for k, v in obj.items()}
                    elif isinstance(obj, list):
                        return [convert_numpy_types(item) for item in obj]
                    else:
                        return obj
                
                context = convert_numpy_types(context)
            except Exception:
                # If conversion fails, use empty context
                context = {}
        
        return {
            "timestamp": self.timestamp,
            "level": self.level.value,
            "message": self.message,
            "context": context,
            "module": self.module
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict())


class LoggingManager:
    """Thread-safe logging manager with real-time streaming support"""
    
    def __init__(self, max_logs: int = 1000):
        self.max_logs = max_logs
        self.logs: List[LogEntry] = []
        self.log_queue: Queue = Queue()
        self.subscribers: List[asyncio.Queue] = []
        self.lock = threading.RLock()
        
        # Setup Python logging integration
        self.setup_python_logging()
    
    def setup_python_logging(self):
        """Setup Python logging to route through our manager"""
        # Create custom handler
        handler = LoggingHandler(self)
        handler.setLevel(logging.DEBUG)
        
        # Create formatter
        formatter = logging.Formatter('%(message)s')
        handler.setFormatter(formatter)
        
        # Get root logger and add our handler
        logger = logging.getLogger('backtest')
        logger.setLevel(logging.DEBUG)
        logger.addHandler(handler)
        logger.propagate = False
    
    def add_log(self, level: LogLevel, message: str, context: Optional[Dict[str, Any]] = None, module: Optional[str] = None):
        """Add a new log entry"""
        timestamp = datetime.now().isoformat()
        entry = LogEntry(
            timestamp=timestamp,
            level=level,
            message=message,
            context=context,
            module=module
        )
        
        with self.lock:
            self.logs.append(entry)
            
            # Maintain max logs limit
            if len(self.logs) > self.max_logs:
                self.logs.pop(0)
            
            # Add to queue for streaming
            self.log_queue.put(entry)
            
            # Notify all subscribers (will be handled by the event loop)
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    asyncio.create_task(self._notify_subscribers(entry))
            except RuntimeError:
                # No event loop running, skip notifications
                pass
    
    async def _notify_subscribers(self, entry: LogEntry):
        """Notify all WebSocket subscribers of new log entry"""
        if not self.subscribers:
            return
            
        dead_subscribers = []
        for subscriber_queue in self.subscribers:
            try:
                await subscriber_queue.put(entry)
            except Exception:
                dead_subscribers.append(subscriber_queue)
        
        # Remove dead subscribers
        for dead in dead_subscribers:
            self.subscribers.remove(dead)
    
    def subscribe(self) -> asyncio.Queue:
        """Subscribe to real-time log updates"""
        queue = asyncio.Queue()
        self.subscribers.append(queue)
        return queue
    
    def unsubscribe(self, queue: asyncio.Queue):
        """Unsubscribe from log updates"""
        if queue in self.subscribers:
            self.subscribers.remove(queue)
    
    def get_logs(self, limit: Optional[int] = None) -> List[LogEntry]:
        """Get recent logs"""
        with self.lock:
            if limit:
                return self.logs[-limit:]
            return self.logs.copy()
    
    def clear_logs(self):
        """Clear all logs"""
        with self.lock:
            self.logs.clear()
            
        # Clear the queue
        while not self.log_queue.empty():
            try:
                self.log_queue.get_nowait()
            except Empty:
                break
    
    def info(self, message: str, context: Optional[Dict[str, Any]] = None, module: Optional[str] = None):
        """Log info message"""
        self.add_log(LogLevel.INFO, message, context, module)
    
    def warn(self, message: str, context: Optional[Dict[str, Any]] = None, module: Optional[str] = None):
        """Log warning message"""
        self.add_log(LogLevel.WARN, message, context, module)
    
    def error(self, message: str, context: Optional[Dict[str, Any]] = None, module: Optional[str] = None):
        """Log error message"""
        self.add_log(LogLevel.ERROR, message, context, module)
    
    def debug(self, message: str, context: Optional[Dict[str, Any]] = None, module: Optional[str] = None):
        """Log debug message"""
        self.add_log(LogLevel.DEBUG, message, context, module)


class LoggingHandler(logging.Handler):
    """Custom logging handler that routes to LoggingManager"""
    
    def __init__(self, manager: LoggingManager):
        super().__init__()
        self.manager = manager
    
    def emit(self, record):
        """Emit a log record"""
        try:
            # Map Python logging levels to our levels
            level_map = {
                logging.DEBUG: LogLevel.DEBUG,
                logging.INFO: LogLevel.INFO,
                logging.WARNING: LogLevel.WARN,
                logging.ERROR: LogLevel.ERROR,
                logging.CRITICAL: LogLevel.ERROR
            }
            
            level = level_map.get(record.levelno, LogLevel.INFO)
            message = self.format(record)
            
            # Extract context from record
            context = {
                'filename': record.filename,
                'lineno': record.lineno,
                'funcname': record.funcName
            }
            
            self.manager.add_log(level, message, context, record.name)
        except Exception:
            self.handleError(record)


# Global logging manager instance
logging_manager = LoggingManager()


def get_logger(module_name: str = None) -> LoggingManager:
    """Get the global logging manager instance"""
    return logging_manager


def log_info(message: str, context: Optional[Dict[str, Any]] = None, module: Optional[str] = None):
    """Convenience function for info logging"""
    logging_manager.info(message, context, module)


def log_warn(message: str, context: Optional[Dict[str, Any]] = None, module: Optional[str] = None):
    """Convenience function for warning logging"""
    logging_manager.warn(message, context, module)


def log_error(message: str, context: Optional[Dict[str, Any]] = None, module: Optional[str] = None):
    """Convenience function for error logging"""
    logging_manager.error(message, context, module)


def log_debug(message: str, context: Optional[Dict[str, Any]] = None, module: Optional[str] = None):
    """Convenience function for debug logging"""
    logging_manager.debug(message, context, module)