"""
Screener Results Cache Manager

This module handles persistent storage and retrieval of screener results,
allowing users to switch tabs without losing their screening data.
Stores complete table data with metadata for each screening session.
"""

import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, asdict
import uuid

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class ScreenerResult:
    """Individual stock result from screening"""
    symbol: str
    criteria_met: Dict[str, bool]
    total_met: int
    pattern_strength: str
    confidence_score: float
    name: str
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization"""
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict) -> 'ScreenerResult':
        """Create instance from dictionary"""
        return cls(**data)

@dataclass
class ScreeningSession:
    """Complete screening session with results and metadata"""
    session_id: str
    screener_type: str  # 'momentum' or 'volatility'
    parameters: Dict[str, Any]
    results: List[ScreenerResult]
    total_results: int
    created_at: str
    updated_at: str
    status: str  # 'running', 'completed', 'error'
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization"""
        return {
            'session_id': self.session_id,
            'screener_type': self.screener_type,
            'parameters': self.parameters,
            'results': [result.to_dict() for result in self.results],
            'total_results': self.total_results,
            'created_at': self.created_at,
            'updated_at': self.updated_at,
            'status': self.status
        }
    
    @classmethod
    def from_dict(cls, data: Dict) -> 'ScreeningSession':
        """Create instance from dictionary"""
        results = [ScreenerResult.from_dict(r) for r in data.get('results', [])]
        return cls(
            session_id=data['session_id'],
            screener_type=data['screener_type'],
            parameters=data['parameters'],
            results=results,
            total_results=data['total_results'],
            created_at=data['created_at'],
            updated_at=data['updated_at'],
            status=data['status']
        )

class ScreenerCache:
    """Manages persistent storage of screener results"""
    
    def __init__(self, cache_file: str = "screener_cache.json", max_sessions: int = 10):
        self.cache_file = Path(cache_file)
        self.max_sessions = max_sessions
        self.sessions: Dict[str, ScreeningSession] = {}
        self.load_cache()
    
    def load_cache(self) -> None:
        """Load cached sessions from disk"""
        try:
            if self.cache_file.exists():
                with open(self.cache_file, 'r') as f:
                    data = json.load(f)
                    
                # Load sessions
                for session_data in data.get('sessions', []):
                    session = ScreeningSession.from_dict(session_data)
                    self.sessions[session.session_id] = session
                    
                logger.info(f"Loaded {len(self.sessions)} cached screening sessions")
            else:
                logger.info("No existing cache file found, starting fresh")
                
        except Exception as e:
            logger.error(f"Error loading cache: {e}")
            self.sessions = {}
    
    def save_cache(self) -> bool:
        """Save sessions to disk"""
        try:
            data = {
                'sessions': [session.to_dict() for session in self.sessions.values()],
                'last_updated': datetime.now().isoformat()
            }
            
            with open(self.cache_file, 'w') as f:
                json.dump(data, f, indent=2)
                
            logger.info(f"Saved {len(self.sessions)} sessions to cache")
            return True
            
        except Exception as e:
            logger.error(f"Error saving cache: {e}")
            return False
    
    def create_session(self, screener_type: str, parameters: Dict[str, Any]) -> str:
        """Create a new screening session"""
        session_id = str(uuid.uuid4())[:8]  # Short unique ID
        now = datetime.now().isoformat()
        
        session = ScreeningSession(
            session_id=session_id,
            screener_type=screener_type,
            parameters=parameters,
            results=[],
            total_results=0,
            created_at=now,
            updated_at=now,
            status='running'
        )
        
        self.sessions[session_id] = session
        self.cleanup_old_sessions()
        self.save_cache()
        
        logger.info(f"Created new {screener_type} screening session: {session_id}")
        return session_id
    
    def update_session_results(self, session_id: str, results: List[Dict], status: str = 'completed') -> bool:
        """Update session with new results"""
        if session_id not in self.sessions:
            logger.error(f"Session {session_id} not found")
            return False
        
        try:
            # Convert dict results to ScreenerResult objects
            screener_results = []
            for result_dict in results:
                screener_result = ScreenerResult(
                    symbol=result_dict.get('symbol', ''),
                    criteria_met=result_dict.get('criteria_met', {}),
                    total_met=result_dict.get('total_met', 0),
                    pattern_strength=result_dict.get('pattern_strength', 'Weak'),
                    confidence_score=result_dict.get('confidence_score', 0.0),
                    name=result_dict.get('name', result_dict.get('symbol', ''))
                )
                screener_results.append(screener_result)
            
            # Update session
            session = self.sessions[session_id]
            session.results = screener_results
            session.total_results = len(screener_results)
            session.updated_at = datetime.now().isoformat()
            session.status = status
            
            self.save_cache()
            logger.info(f"Updated session {session_id} with {len(screener_results)} results")
            return True
            
        except Exception as e:
            logger.error(f"Error updating session {session_id}: {e}")
            return False
    
    def add_result_to_session(self, session_id: str, result: Dict) -> bool:
        """Add a single result to an ongoing session (for streaming)"""
        if session_id not in self.sessions:
            logger.error(f"Session {session_id} not found")
            return False
        
        try:
            screener_result = ScreenerResult(
                symbol=result.get('symbol', ''),
                criteria_met=result.get('criteria_met', {}),
                total_met=result.get('total_met', 0),
                pattern_strength=result.get('pattern_strength', 'Weak'),
                confidence_score=result.get('confidence_score', 0.0),
                name=result.get('name', result.get('symbol', ''))
            )
            
            session = self.sessions[session_id]
            session.results.append(screener_result)
            session.total_results = len(session.results)
            session.updated_at = datetime.now().isoformat()
            
            # Save every 10 results to avoid too frequent disk writes
            if len(session.results) % 10 == 0:
                self.save_cache()
            
            return True
            
        except Exception as e:
            logger.error(f"Error adding result to session {session_id}: {e}")
            return False
    
    def get_session(self, session_id: str) -> Optional[ScreeningSession]:
        """Get a specific session"""
        return self.sessions.get(session_id)
    
    def get_latest_session(self, screener_type: Optional[str] = None) -> Optional[ScreeningSession]:
        """Get the most recent session, optionally filtered by type"""
        if not self.sessions:
            return None
        
        # Filter by type if specified
        filtered_sessions = self.sessions.values()
        if screener_type:
            filtered_sessions = [s for s in filtered_sessions if s.screener_type == screener_type]
        
        if not filtered_sessions:
            return None
        
        # Return the most recent one
        return max(filtered_sessions, key=lambda s: s.updated_at)
    
    def get_session_results(self, session_id: str, page: int = 1, page_size: int = 50) -> Dict:
        """Get paginated results for a session"""
        session = self.sessions.get(session_id)
        if not session:
            return {
                'error': f'Session {session_id} not found',
                'results': [],
                'total': 0,
                'page': page,
                'page_size': page_size,
                'total_pages': 0
            }
        
        # Calculate pagination
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        total_results = len(session.results)
        total_pages = (total_results + page_size - 1) // page_size  # Ceiling division
        
        # Get page of results
        page_results = session.results[start_idx:end_idx]
        
        return {
            'session_id': session_id,
            'screener_type': session.screener_type,
            'parameters': session.parameters,
            'results': [result.to_dict() for result in page_results],
            'total': total_results,
            'page': page,
            'page_size': page_size,
            'total_pages': total_pages,
            'status': session.status,
            'created_at': session.created_at,
            'updated_at': session.updated_at
        }
    
    def list_sessions(self) -> List[Dict]:
        """List all sessions with summary info"""
        return [
            {
                'session_id': session.session_id,
                'screener_type': session.screener_type,
                'total_results': session.total_results,
                'status': session.status,
                'created_at': session.created_at,
                'updated_at': session.updated_at
            }
            for session in sorted(self.sessions.values(), key=lambda s: s.updated_at, reverse=True)
        ]
    
    def cleanup_old_sessions(self) -> None:
        """Remove old sessions to keep cache size manageable"""
        if len(self.sessions) <= self.max_sessions:
            return
        
        # Sort by update time and keep only the most recent ones
        sorted_sessions = sorted(self.sessions.values(), key=lambda s: s.updated_at, reverse=True)
        sessions_to_keep = sorted_sessions[:self.max_sessions]
        
        # Create new sessions dict with only the sessions to keep
        self.sessions = {s.session_id: s for s in sessions_to_keep}
        
        logger.info(f"Cleaned up old sessions, keeping {len(self.sessions)} most recent")
    
    def delete_session(self, session_id: str) -> bool:
        """Delete a specific session"""
        if session_id in self.sessions:
            del self.sessions[session_id]
            self.save_cache()
            logger.info(f"Deleted session {session_id}")
            return True
        return False
    
    def clear_cache(self) -> bool:
        """Clear all cached sessions"""
        self.sessions = {}
        try:
            if self.cache_file.exists():
                self.cache_file.unlink()
            logger.info("Cleared all cached sessions")
            return True
        except Exception as e:
            logger.error(f"Error clearing cache: {e}")
            return False

# Global cache instance
_cache_instance = None

def get_cache() -> ScreenerCache:
    """Get the global cache instance"""
    global _cache_instance
    if _cache_instance is None:
        _cache_instance = ScreenerCache()
    return _cache_instance

# Convenience functions for easy usage
def create_screening_session(screener_type: str, parameters: Dict[str, Any]) -> str:
    """Create a new screening session"""
    return get_cache().create_session(screener_type, parameters)

def update_screening_results(session_id: str, results: List[Dict], status: str = 'completed') -> bool:
    """Update session with final results"""
    return get_cache().update_session_results(session_id, results, status)

def add_streaming_result(session_id: str, result: Dict) -> bool:
    """Add a single result during streaming"""
    return get_cache().add_result_to_session(session_id, result)

def get_screening_session(session_id: str) -> Optional[ScreeningSession]:
    """Get a specific screening session"""
    return get_cache().get_session(session_id)

def get_latest_screening_session(screener_type: Optional[str] = None) -> Optional[ScreeningSession]:
    """Get the most recent screening session"""
    return get_cache().get_latest_session(screener_type)

def get_paginated_results(session_id: str, page: int = 1, page_size: int = 50) -> Dict:
    """Get paginated results for a session"""
    return get_cache().get_session_results(session_id, page, page_size)

# Example usage and testing
if __name__ == "__main__":
    # Example of how to use the cache
    cache = ScreenerCache()
    
    # Create a test session
    session_id = cache.create_session('momentum', {
        'min_percentage_move': 30,
        'max_consolidation_range': 10,
        'period': '6mo'
    })
    
    print(f"Created session: {session_id}")
    
    # Add some test results
    test_results = [
        {
            'symbol': 'AAPL',
            'criteria_met': {'large_move': True, 'consolidation': False, 'above_50_sma': True},
            'total_met': 2,
            'pattern_strength': 'Weak',
            'confidence_score': 33.3,
            'name': 'Apple Inc.'
        },
        {
            'symbol': 'MSFT',
            'criteria_met': {'large_move': True, 'consolidation': True, 'above_50_sma': True},
            'total_met': 3,
            'pattern_strength': 'Moderate',
            'confidence_score': 50.0,
            'name': 'Microsoft Corporation'
        }
    ]
    
    cache.update_session_results(session_id, test_results)
    
    # Retrieve results
    results = cache.get_session_results(session_id, page=1, page_size=10)
    print(f"Retrieved {len(results['results'])} results from session")
    
    # List all sessions
    sessions = cache.list_sessions()
    print(f"Total sessions: {len(sessions)}")
    
    print("Cache system test completed successfully!")

