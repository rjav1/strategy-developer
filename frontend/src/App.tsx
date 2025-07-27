import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';

import Analytics from './pages/Analytics';
import DataUpload from './pages/DataUpload';
import Strategies from './pages/Strategies';
import Screeners from './pages/Screeners';
import BacktestEngine from './pages/BacktestEngine';
import Results from './pages/Results';
import Settings from './pages/Settings';

function App() {
  return (
    <Router>
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <header className="bg-white border-b p-4 shadow text-gray-800 font-medium">
            Analytics Dashboard
          </header>
          <main className="flex-1 p-6 overflow-auto bg-gray-50">
            <Routes>
              <Route path="/" element={<Analytics />} />
              <Route path="/upload" element={<DataUpload />} />
              <Route path="/strategies" element={<Strategies />} />
              <Route path="/screeners" element={<Screeners />} />
              <Route path="/backtest" element={<BacktestEngine />} />
              <Route path="/results" element={<Results />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
}

export default App;
