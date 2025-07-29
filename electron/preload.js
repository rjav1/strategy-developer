const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  selectFile: (options) => ipcRenderer.invoke('select-file', options),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  saveFile: (options) => ipcRenderer.invoke('save-file', options),
  
  // Backend API calls
  fetchBackend: async (endpoint, options = {}) => {
    const response = await fetch(`http://localhost:8000${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    return response.json();
  },
  
  // Strategy API calls
  uploadStrategy: async (filePath) => {
    return ipcRenderer.invoke('upload-strategy', filePath);
  },
  
  uploadData: async (filePath) => {
    return ipcRenderer.invoke('upload-data', filePath);
  },
  
  runBacktest: async (config) => {
    return ipcRenderer.invoke('run-backtest', config);
  },
  
  getResults: async () => {
    return ipcRenderer.invoke('get-results');
  },
  
  saveResults: async (results, filePath) => {
    return ipcRenderer.invoke('save-results', results, filePath);
  }
}); 