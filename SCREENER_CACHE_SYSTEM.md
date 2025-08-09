# Screener Cache System

## Overview

The Screener Cache System is a backend solution that persistently stores screening results in a separate Python file, preventing data loss when switching tabs and eliminating the need to re-run screenings.

## Features

### ✅ **Persistent Storage**
- All screening results are automatically saved to `screener_cache.json`
- Results persist across browser sessions and tab switches
- Each screening session gets a unique ID for tracking

### ✅ **Comprehensive Data Storage**
- **Complete table data**: Every column and row from screening results
- **Session metadata**: Parameters used, timestamps, status
- **Pagination support**: Large result sets are efficiently handled
- **Result history**: Keep track of multiple screening sessions

### ✅ **Automatic Integration**
- **Zero frontend changes needed**: Works with existing screener code
- **Background caching**: Results are cached during screening without affecting performance
- **Streaming support**: Real-time caching during streaming screenings

### ✅ **Robust Management**
- **Session cleanup**: Automatically removes old sessions (keeps last 10)
- **Error handling**: Cache failures don't affect screening functionality
- **API endpoints**: Full REST API for cache management

## Architecture

### Backend Components

1. **`screener_cache.py`** - Core caching logic
   - `ScreenerCache` class: Main cache manager
   - `ScreeningSession` class: Session data structure  
   - `ScreenerResult` class: Individual stock result structure

2. **Modified `main.py`** - Integration points
   - Cache session creation on screening start
   - Real-time result updates during streaming
   - Completion status updates

3. **API Endpoints** - Cache access layer
   - Session management
   - Result retrieval with pagination
   - Cache cleanup and maintenance

### Data Flow

```
1. User starts screening
   ↓
2. Backend creates cache session
   ↓
3. Results stream in → Cache updates in real-time
   ↓
4. Screening completes → Cache marked as complete
   ↓
5. User switches tabs → Frontend can retrieve cached results
   ↓
6. User returns → Latest results load from cache
```

## API Endpoints

### Session Management
- `GET /screener-cache/sessions` - List all sessions
- `GET /screener-cache/sessions/{id}` - Get session details
- `DELETE /screener-cache/sessions/{id}` - Delete session
- `DELETE /screener-cache/clear` - Clear all sessions

### Result Retrieval
- `GET /screener-cache/sessions/{id}/results?page=1&page_size=50` - Get paginated results
- `GET /screener-cache/latest` - Get most recent session
- `GET /screener-cache/latest/results?page=1&page_size=50` - Get latest results

### Enhanced Streaming Response
The streaming endpoint now returns session IDs in completion messages:
```json
{
  "type": "complete",
  "results": [...],
  "total_found": 25,
  "message": "Screening completed!",
  "session_id": "a1b2c3d4"
}
```

## Frontend Integration Options

### Option 1: Automatic Latest Results (Simplest)
```javascript
// Load latest results on page mount
useEffect(() => {
  const loadLatestResults = async () => {
    try {
      const response = await fetch('http://localhost:8000/screener-cache/latest/results')
      const data = await response.json()
      if (data.results) {
        setResults(data.results)
        setAllResults(data.results)
      }
    } catch (err) {
      console.log('No cached results available')
    }
  }
  
  loadLatestResults()
}, [])
```

### Option 2: Session-Based Loading (More Control)
```javascript
// Store session ID from completion message
const handleCompletion = (data) => {
  if (data.session_id) {
    localStorage.setItem('lastSessionId', data.session_id)
  }
}

// Load specific session on mount
const loadSession = async (sessionId) => {
  const response = await fetch(`http://localhost:8000/screener-cache/sessions/${sessionId}/results`)
  const data = await response.json()
  return data.results
}
```

### Option 3: Progressive Loading (Best Performance)
```javascript
// Load results page by page for large datasets
const loadResultsPage = async (sessionId, page = 1) => {
  const response = await fetch(
    `http://localhost:8000/screener-cache/sessions/${sessionId}/results?page=${page}&page_size=50`
  )
  return await response.json()
}
```

## Cache File Structure

### `screener_cache.json`
```json
{
  "sessions": [
    {
      "session_id": "a1b2c3d4",
      "screener_type": "momentum",
      "parameters": {
        "symbols": ["AAPL", "MSFT"],
        "criteria": {...},
        "include_bad_setups": false
      },
      "results": [
        {
          "symbol": "AAPL",
          "criteria_met": {
            "large_move": true,
            "consolidation": false,
            "above_50_sma": true,
            "adr_range": false,
            "avg_volume": true,
            "industry_strength": false
          },
          "total_met": 3,
          "pattern_strength": "Moderate",
          "confidence_score": 50.0,
          "name": "Apple Inc."
        }
      ],
      "total_results": 25,
      "created_at": "2025-01-06T12:00:00",
      "updated_at": "2025-01-06T12:05:00",
      "status": "completed"
    }
  ],
  "last_updated": "2025-01-06T12:05:00"
}
```

## Testing the System

### 1. Basic Cache Test
```bash
# Test cache system
cd backend && python3 screener_cache.py
```

### 2. API Test (with server running)
```bash
# Start backend server
cd backend && python3 -m uvicorn main:app --reload --port 8000

# Test cache endpoints
curl http://localhost:8000/screener-cache/sessions
curl http://localhost:8000/screener-cache/latest
```

### 3. End-to-End Test
1. Run momentum screener from frontend
2. Check cache file: `cat backend/screener_cache.json`
3. Switch tabs and return - results should persist
4. Test API: `curl http://localhost:8000/screener-cache/latest/results`

## Configuration Options

### Cache Settings (in `screener_cache.py`)
```python
cache = ScreenerCache(
    cache_file="screener_cache.json",  # Cache file location
    max_sessions=10                    # Max sessions to keep
)
```

### Pagination Settings
- Default page size: 50 results
- Maximum page size: 200 results
- Page numbers start at 1

## Benefits

### For Users
✅ **No more lost work** - Switch tabs freely without losing results  
✅ **Faster navigation** - Return to screener with instant result loading  
✅ **Session history** - Access previous screening runs  
✅ **Better performance** - No need to re-run screenings  

### For Developers
✅ **Clean separation** - Caching logic isolated in separate module  
✅ **Backwards compatible** - Existing frontend code continues to work  
✅ **Scalable** - Handles large result sets with pagination  
✅ **Maintainable** - Clear API and data structures  

## Migration Path

### Phase 1: Backend Only (Current)
- Cache works automatically
- Frontend continues as before
- Results persist via browser localStorage + backend cache

### Phase 2: Frontend Enhancement (Optional)
- Add cache-aware loading on page mount
- Implement session management UI
- Add result history browsing

### Phase 3: Advanced Features (Future)
- Export cached results
- Share sessions between users  
- Advanced filtering and search

## Troubleshooting

### Cache File Issues
```bash
# Check cache file
cat backend/screener_cache.json

# Clear cache if corrupted
curl -X DELETE http://localhost:8000/screener-cache/clear
```

### Performance Issues
- Large cache files: Use pagination
- Memory usage: Reduce `max_sessions`
- Disk space: Regular cleanup of old sessions

### Integration Issues
- Check backend logs for caching errors
- Verify API endpoints are accessible
- Test with small result sets first

The system is designed to be robust and fail gracefully - if caching fails, the screening continues normally without cache functionality.

