# Testing Guide for Enhanced Features

## Quick Testing Checklist

### 🔧 Setup Requirements
1. **Backend**: Ensure FastAPI server is running on `localhost:8000`
2. **Frontend**: Next.js development server running
3. **Data**: Have some test ticker data (e.g., ALAB, TSLA) ready for backtesting

---

## 1. Testing WebSocket Log Streaming

### ✅ Connection Test
1. Open browser DevTools (F12) → Console tab
2. Navigate to backtest page
3. Click "Show Live Logs" button
4. **Expected**: Console should show:
   ```
   🔌 Attempting WebSocket connection to: ws://localhost:8000/ws/logs
   ✅ WebSocket connected to log streaming
   ✅ WebSocket connection confirmed: Log streaming active
   ```

### ✅ Log Streaming Test
1. With log console open, start a backtest (e.g., ALAB)
2. **Expected**: Real-time logs should appear:
   - Blue INFO messages for progress updates
   - Color-coded log levels
   - Automatic scrolling to newest entries
   - Connection status showing green "Connected"

### ✅ Reconnection Test
1. Stop the FastAPI backend server while log console is open
2. **Expected**: 
   - Status changes to red "Disconnected"
   - Console shows retry attempts with exponential backoff
   - Manual retry button appears after max attempts
3. Restart backend server
4. Click retry button or wait for auto-reconnection
5. **Expected**: Connection restored, logs resume

### ✅ Log Controls Test
1. **Pause/Resume**: Click pause button, verify logs stop streaming
2. **Filter by Level**: Select "ERROR" only, verify only error messages show
3. **Text Filter**: Type "ALAB" in filter box, verify only matching messages show
4. **Clear Logs**: Click trash button, verify logs are cleared
5. **Export**: Click download button, verify JSON file downloads

---

## 2. Testing Smooth Sliding Chart

### ✅ Basic Animation Test
1. Run a backtest and get results
2. Switch to "Smooth Sliding" chart tab
3. Click Play button
4. **Expected**:
   - Chart should smoothly slide from left to right
   - Fixed 30-day window maintained (no compression/stretching)
   - Smooth 60fps animation
   - Progress bar advances smoothly

### ✅ Speed Control Test
1. With animation playing, adjust speed slider (0.1 to 5.0 days/second)
2. **Expected**: 
   - Animation speed changes immediately
   - Smooth transitions between speeds
   - Speed display updates (e.g., "2.3d/s")

### ✅ Window Size Test
1. Change "Days" dropdown from 30 to different values (7, 14, 60, 90)
2. **Expected**:
   - Visible time window adjusts immediately
   - Chart maintains smooth animation
   - More/fewer candles visible based on selection

### ✅ Animation Controls Test
1. **Pause**: Animation should stop immediately
2. **Reset**: Should jump back to beginning of data
3. **Jump to End**: Should skip to end of dataset
4. **Play**: Should resume from current position

### ✅ State Persistence Test
1. Set specific speed (e.g., 2.5d/s) and window size (e.g., 60 days)
2. Switch to different chart type (e.g., "Enhanced View")
3. Switch back to "Smooth Sliding"
4. **Expected**: Previous settings should be restored
5. Run backtest on different ticker
6. Switch back to original ticker
7. **Expected**: Settings should be remembered per ticker

---

## 3. Error Scenarios to Test

### 🧪 WebSocket Error Cases

#### **Backend Not Running**
1. Stop FastAPI server
2. Open log console
3. **Expected**: 
   - "Backend not available, waiting before retry..."
   - Exponential backoff attempts
   - Manual retry button after max attempts

#### **Network Interruption Simulation**
1. Start log streaming
2. Temporarily block port 8000 (firewall/network settings)
3. **Expected**: 
   - Connection drops gracefully
   - Automatic retry attempts
   - Recovery when network restored

#### **Invalid WebSocket URL**
1. Modify LogConsole.tsx to use wrong port (e.g., 8001)
2. **Expected**: 
   - Connection fails immediately
   - Proper error messaging
   - Retry attempts with correct error handling

### 🧪 Animation Error Cases

#### **No Data Scenario**
1. Try to open smooth sliding chart with empty dataset
2. **Expected**: "No data available" message

#### **Performance Test**
1. Load very large dataset (1000+ candles)
2. Set minimum window size (7 days) and maximum speed (5.0d/s)
3. **Expected**: 
   - Smooth animation maintained
   - No frame drops or stuttering
   - Memory usage remains stable

#### **Browser Tab Switching**
1. Start smooth animation
2. Switch to different browser tab for 30+ seconds
3. Switch back
4. **Expected**: 
   - Animation resumes smoothly
   - No accumulated time drift
   - Performance remains optimal

---

## 4. Performance Verification

### 📊 Memory Usage
1. Open Chrome DevTools → Performance tab
2. Start recording
3. Run smooth animation for 2-3 minutes
4. Check memory usage graph
5. **Expected**: Stable memory usage, no memory leaks

### 📊 Frame Rate
1. Open Chrome DevTools → Rendering tab
2. Enable "FPS meter"
3. Run smooth animation
4. **Expected**: Consistent 60fps (or close) during animation

### 📊 Network Usage
1. Open Chrome DevTools → Network tab
2. Start log streaming
3. Run backtest with logs
4. **Expected**: 
   - Minimal network usage after initial connection
   - No polling requests (only WebSocket messages)
   - Clean connection closure when needed

---

## 5. Browser Compatibility

### 🌐 Test Browsers
- **Chrome**: Primary development target
- **Firefox**: Should work identically
- **Safari**: May have minor differences but functional
- **Edge**: Should work identically to Chrome

### 🌐 Mobile Testing (Optional)
- **iOS Safari**: Touch controls may differ
- **Android Chrome**: Should work with touch adjustments

---

## 6. Troubleshooting Common Issues

### ❌ "WebSocket connection failed"
**Solutions**:
1. Verify FastAPI server is running on port 8000
2. Check browser console for detailed error messages
3. Ensure no firewall blocking WebSocket connections
4. Try manual retry button

### ❌ "Smooth animation stuttering"
**Solutions**:
1. Check browser performance (other tabs, extensions)
2. Reduce window size or animation speed
3. Verify sufficient system resources
4. Check for JavaScript errors in console

### ❌ "Chart not loading"
**Solutions**:
1. Verify backtest completed successfully
2. Check for JavaScript errors
3. Ensure Plotly.js loaded correctly
4. Try refreshing the page

### ❌ "Settings not persisting"
**Solutions**:
1. Check browser localStorage enabled
2. Verify no browser privacy modes active
3. Clear browser cache and test again

---

## 7. Success Criteria

### ✅ WebSocket Implementation Success
- [ ] Connects immediately when backend available
- [ ] Handles backend unavailability gracefully
- [ ] Reconnects automatically with exponential backoff
- [ ] Streams logs in real-time without delays
- [ ] Shows accurate connection status
- [ ] Cleans up resources properly

### ✅ Smooth Sliding Implementation Success
- [ ] Maintains exactly 60fps animation (or close)
- [ ] Never compresses or stretches time scale
- [ ] Responds immediately to speed/window changes
- [ ] Persists settings across ticker switches
- [ ] Handles large datasets without performance issues
- [ ] Provides intuitive user controls

---

## 8. Performance Benchmarks

### 🎯 Target Metrics
- **Animation FPS**: 58-60fps (consistent)
- **WebSocket Latency**: <100ms for log messages
- **Memory Usage**: <50MB additional for features
- **Connection Recovery**: <5 seconds after backend restart
- **Setting Persistence**: Instant restoration

### 📈 Monitoring Tools
- Chrome DevTools Performance tab
- WebSocket frame inspector
- React DevTools Profiler
- Browser memory usage monitor

---

This testing guide ensures both features work reliably across different scenarios and edge cases. Each test should pass for a successful implementation.