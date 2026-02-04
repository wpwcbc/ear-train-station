import { useEffect, useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import './App.css';
import { MapPage } from './pages/MapPage';
import { StationPage } from './pages/StationPage';
import { ReviewPage } from './pages/ReviewPage';
import { loadProgress, saveProgress, type Progress } from './lib/progress';
import { BUILD_INFO } from './buildInfo';

function App() {
  const [progress, setProgress] = useState<Progress>(() => loadProgress());

  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  return (
    <div className="app">
      <header className="topBar">
        <Link to="/" className="brandLink">
          <div className="brand">Ear Train Station</div>
          <div className="tag">scales • intervals • chords</div>
        </Link>
        <div className="topStats">
          <div className="pill">XP {progress.xp}</div>
          <div className="pill">
            Today {Math.min(progress.dailyXpToday, progress.dailyGoalXp)}/{progress.dailyGoalXp}
          </div>
          <div className="pill">Streak {progress.streakDays}</div>
        </div>
      </header>

      <main className="main">
        <Routes>
          <Route path="/" element={<MapPage progress={progress} setProgress={setProgress} />} />
          <Route path="/review" element={<ReviewPage progress={progress} setProgress={setProgress} />} />
          <Route path="/station/:stationId" element={<StationPage progress={progress} setProgress={setProgress} />} />
        </Routes>
      </main>

      <footer className="footer">
        <div className="footerInner">
          <span className="footerLabel">Last update:</span>
          <span className="footerValue">{BUILD_INFO.committedAt}</span>
          <span className="footerLabel">commit</span>
          <span className="footerValue">{BUILD_INFO.commit}</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
