import { ArrowRight, Sparkles, Star, Zap } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { SprinkleField } from '../../../components/ui/Sprinkles';
import { dataClient } from '../../../lib/data/client';
import { useAuth } from '../../../app/providers';

const STAR_LABELS = ['', '★', '★★', '★★★', '★★★★', '★★★★★'];
const EMPTY_STARS = ['', '★★★★★', '★★★★', '★★★', '★★', '★'];

export function ReportsPage() {
  const { familyId } = useAuth();
  const { childId } = useParams<{ childId?: string }>();

  const { data: children = [] } = useQuery({
    queryKey: ['children', familyId],
    queryFn: () => dataClient.getChildren(familyId),
  });

  // Find the target child — use URL param if present, else first child
  const child = (childId ? children.find(c => c.id === childId) : null) ?? children[0];

  // Reports are stored by teacher_id; fetch all teachers then all their reports
  const { data: teachers = [] } = useQuery({
    queryKey: ['teachers'],
    queryFn: () => dataClient.getTeachers(),
  });

  const { data: allReports = [], isLoading } = useQuery({
    queryKey: ['allReports', teachers.map(t => t.id).join(',')],
    queryFn: async () => {
      const results = await Promise.all(teachers.map(t => dataClient.getReports(t.id)));
      return results.flat();
    },
    enabled: teachers.length > 0,
  });

  // Filter to reports for this child
  const childReports = child ? allReports.filter(r => r.child_id === child.id) : [];
  const latest = childReports[childReports.length - 1] ?? null;

  if (isLoading) return <div className="page-stack"><p>Loading…</p></div>;

  // No reports yet — show placeholder
  if (!latest) {
    return (
      <div className="page-stack">
        <div className="report-hero">
          <SprinkleField count={12} />
          <div>
            <div className="eyebrow">Reports</div>
            <h2>{child?.name.split(' ')[0] ?? 'Your child'}'s learning journey</h2>
            <p>No reports have been written yet. Reports will appear here after each term.</p>
          </div>
        </div>
      </div>
    );
  }

  const overallPct = ((latest.overall / 5) * 100).toFixed(0);
  const stars = STAR_LABELS[latest.overall] ?? '';
  const emptyStars = EMPTY_STARS[latest.overall] ?? '';

  return (
    <div className="page-stack">
      <div className="report-hero">
        <SprinkleField count={12} />
        <div>
          <div className="eyebrow">End of Term Report · {latest.term}</div>
          <h2>{child?.name.split(' ')[0]}'s learning journey</h2>
          <p>A thoughtful look at all the progress they've made.</p>
        </div>
        <div className="overall-score">
          <strong>{latest.overall}.0</strong><span>Overall progress</span>
          <div>{stars}<i>{emptyStars}</i></div>
        </div>
      </div>

      <div className="report-grid">
        <div className="card">
          <div className="card-heading">
            <div><span className="label">Learning snapshot</span><h3>Confidence is growing</h3></div>
            <span className="trend"><Zap size={14} /> {latest.term}</span>
          </div>
          {latest.subjects.map(s => (
            <div className="star-row" key={s.subject}>
              <span>{s.subject}</span>
              <b>{STAR_LABELS[s.rating]}<i>{EMPTY_STARS[s.rating]}</i></b>
            </div>
          ))}
          {latest.subjects.length === 0 && (
            <div className="star-row"><span>Overall</span><b>{stars}<i>{emptyStars}</i></b></div>
          )}
          <Button variant="soft" icon={ArrowRight}>View full report</Button>
        </div>

        <div className="card quote-card">
          <Sparkles size={21} />
          <span className="label">Tutor note</span>
          <p>"{latest.note}"</p>
          <div className="tutor-mini">
            <div className="mini-avatar pink-bg">
              {teachers.find(t => t.id === latest.teacher_id)?.initials ?? 'T'}
            </div>
            <small>
              {teachers.find(t => t.id === latest.teacher_id)?.name ?? 'Your tutor'}<br />
              <b>{child?.name.split(' ')[0]}'s tutor</b>
            </small>
          </div>
        </div>

        {latest.strengths && (
          <div className="card strength-card">
            <div className="strength-icon"><Star size={18} /></div>
            <span className="label">Strengths</span>
            <p>{latest.strengths}</p>
          </div>
        )}

        {latest.areas && (
          <div className="card continue-card">
            <div className="strength-icon orange-bg"><ArrowRight size={18} /></div>
            <span className="label">Areas to continue</span>
            <p>{latest.areas}</p>
          </div>
        )}
      </div>

      {/* Previous reports */}
      {childReports.length > 1 && (
        <div className="card">
          <div className="card-heading"><div><span className="label">Report history</span><h3>Previous terms</h3></div></div>
          {childReports.slice(0, -1).reverse().map(r => (
            <div className="star-row" key={r.id}>
              <span>{r.term}</span>
              <b>{STAR_LABELS[r.overall]}<i>{EMPTY_STARS[r.overall]}</i></b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
