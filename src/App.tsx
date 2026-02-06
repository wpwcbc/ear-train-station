import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { NavShell } from './components/NavShell';
import { LearnSectionsPage } from './pages/LearnSectionsPage';
import { SectionDetailPage } from './pages/SectionDetailPage';
import { SectionExamPage } from './pages/SectionExamPage';
import { StationPage } from './pages/StationPage';
import { LeaguePage } from './pages/LeaguePage';
import { PracticePage } from './pages/PracticePage';
import { ReviewPage } from './pages/ReviewPage';
import { QuestsPage } from './pages/QuestsPage';
import { ProfilePage } from './pages/ProfilePage';
import { loadProgress, saveProgress, type Progress } from './lib/progress';
import './App.css';

function App() {
  const [progress, setProgress] = useState<Progress>(() => loadProgress());

  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  return (
    <Routes>
      <Route element={<NavShell />}>
        <Route index element={<Navigate to="/learn" replace />} />

        <Route path="/learn" element={<LearnSectionsPage progress={progress} />} />
        <Route path="/learn/section/:sectionId" element={<SectionDetailPage progress={progress} setProgress={setProgress} />} />
        <Route path="/learn/section/:sectionId/exam" element={<SectionExamPage progress={progress} />} />

        <Route path="/lesson/:stationId" element={<StationPage progress={progress} setProgress={setProgress} />} />

        <Route path="/practice" element={<PracticePage progress={progress} />} />
        <Route path="/review" element={<ReviewPage progress={progress} setProgress={setProgress} />} />
        <Route path="/quests" element={<QuestsPage progress={progress} />} />
        <Route path="/leaderboard" element={<LeaguePage progress={progress} />} />
        <Route path="/profile" element={<ProfilePage progress={progress} setProgress={setProgress} />} />

        <Route path="*" element={<Navigate to="/learn" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
