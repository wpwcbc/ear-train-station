import type { Progress } from '../lib/progress';
import { LearnMap } from '../components/LearnMap';

export function LearnSectionsPage({ progress }: { progress: Progress }) {
  return (
    <div className="page">
      <h1 className="h1">Learn</h1>
      <p className="sub">Follow the line: finish section exams to unlock the next route.</p>

      <LearnMap progress={progress} />
    </div>
  );
}
