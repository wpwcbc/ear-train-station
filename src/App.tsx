import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { NavShell } from './components/NavShell';
import { LearnSectionsPage } from './pages/LearnSectionsPage';
import { SectionDetailPage } from './pages/SectionDetailPage';
import { StationPage } from './pages/StationPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { loadProgress, saveProgress, type Progress } from './lib/progress';

function App() {
  const [progress, setProgress] = useState<Progress>(() => loadProgress());

  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  return (
    <Routes>
      <Route element={<NavShell />}>
        <Route index element={<Navigate to="/learn" replace />} />

        <Route path="/learn" element={<LearnSectionsPage />} />
        <Route path="/learn/section/:sectionId" element={<SectionDetailPage progress={progress} setProgress={setProgress} />} />

        <Route path="/lesson/:stationId" element={<StationPage progress={progress} setProgress={setProgress} />} />

        <Route path="/practice" element={<PlaceholderPage title="Practice" desc="Targeted practice, due reviews, and daily workout." />} />
        <Route path="/quests" element={<PlaceholderPage title="Quests" desc="Daily quests and streak boosts." />} />
        <Route path="/leaderboard" element={<PlaceholderPage title="League" desc="Weekly XP league (future: friends + global)." />} />
        <Route path="/profile" element={<PlaceholderPage title="Profile" desc="Personal info, stats, settings." />} />

        <Route path="*" element={<Navigate to="/learn" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
