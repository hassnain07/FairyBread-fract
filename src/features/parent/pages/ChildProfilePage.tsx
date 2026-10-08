import { ArrowRight, BookOpen, Check, Download, Plus, X, Zap } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { Progress } from '../../../components/ui/Progress';
import { dataClient } from '../../../lib/data/client';
import { useAuth } from '../../../app/providers';

// Static enrichment data per child id — mirrors prototype display
const enrichmentByChildId: Record<string, {
  maths: number; english: number; spelling: number; attendance: number; trend: string;
  tutorName: string; tutorInitials: string; tutorColor: string;
  goals: string[]; goalsDone: number;
  programs: { name: string; tutor: string; pct: number; color: string }[];
  attendanceBars: number[];
}> = {
  c1: { maths: 80, english: 72, spelling: 78, attendance: 94, trend: '+12%', tutorName: 'Jessica Taylor', tutorInitials: 'JT', tutorColor: 'pink', goals: ['Explain fractions with confidence', 'Read unfamiliar texts fluently', 'Use richer vocabulary in writing'], goalsDone: 2, programs: [{ name: 'Mathematics foundations', tutor: 'Jessica Taylor', pct: 80, color: 'pink' }, { name: 'English confidence', tutor: 'Sarah Wilson', pct: 72, color: 'teal' }], attendanceBars: [75, 90, 80, 100, 94, 100] },
  c2: { maths: 64, english: 78, spelling: 70, attendance: 88, trend: '+8%', tutorName: 'Sarah Wilson', tutorInitials: 'SW', tutorColor: 'teal', goals: ['Build confidence with addition', 'Read aloud with expression'], goalsDone: 1, programs: [{ name: 'English confidence', tutor: 'Sarah Wilson', pct: 78, color: 'teal' }], attendanceBars: [60, 75, 85, 70, 90, 88] },
};

type Tab = 'overview' | 'goals' | 'attendance' | 'sessions' | 'notes';

export function ChildProfilePage() {
  const { childId } = useParams<{ childId: string }>();
  const { familyId } = useAuth();

  const { data: children = [] } = useQuery({
    queryKey: ['children', familyId],
    queryFn: () => dataClient.getChildren(familyId),
  });

  const child = children.find(c => c.id === childId) ?? children[0];
  const e = (childId && enrichmentByChildId[childId]) ? enrichmentByChildId[childId] : enrichmentByChildId['c1'];

  const [tab, setTab] = useState<Tab>('overview');
  const [goals, setGoals] = useState(e.goals.map((g, i) => ({ text: g, done: i < e.goalsDone })));
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [goalForm, setGoalForm] = useState({ text: '', subject: 'Mathematics' });

  const handleAddGoal = () => {
    if (!goalForm.text.trim()) return;
    setGoals(prev => [{ text: goalForm.text.trim(), done: false }, ...prev]);
    setGoalForm({ text: '', subject: 'Mathematics' });
    setShowAddGoal(false);
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' }, { key: 'goals', label: 'Goals' },
    { key: 'attendance', label: 'Attendance' }, { key: 'sessions', label: 'Sessions' }, { key: 'notes', label: 'Notes' },
  ];

  if (!child) return <div className="page-stack"><p>Loading...</p></div>;

  return (
    <div className="page-stack">
      <div className="profile-banner">
        <div className="child-avatar large">{child.initials}</div>
        <div>
          <div className="eyebrow">Student profile</div>
          <h2>{child.name}</h2>
          <p>{child.year} · {child.school}</p>
        </div>
        <div className="profile-actions">
          <Button variant="soft" icon={Download}>Download summary</Button>
          <Button icon={ArrowRight}>View full report</Button>
        </div>
      </div>
      <div className="profile-tabs">
        {tabs.map(t => <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>
      {tab === 'overview' && (
        <>
          <div className="grid-2">
            <div className="card">
              <div className="card-heading">
                <div><span className="label">Progress snapshot</span><h3>Big wins, week by week</h3></div>
                <span className="trend"><Zap size={14} /> {e.trend}</span>
              </div>
              {[['Mathematics', e.maths, 'pink', 'Fractions'], ['Reading', e.english, 'teal', 'Comprehension'], ['Spelling', e.spelling, 'yellow', 'Word patterns']].map(([label, val, color, sub]) => (
                <div className="subject-progress" key={label as string}>
                  <div><span className={`subject-dot ${color}-dot`} />{label} <b>{val}%</b></div>
                  <small>{sub}</small>
                  <Progress value={val as number} color={color as string} />
                </div>
              ))}
            </div>
            <div className="card goals-card">
              <span className="label">Learning goals</span>
              <h3>What we're working towards</h3>
              {goals.map((g, i) => (
                <div className="goal" key={i}>
                  <span className={`goal-check ${g.done ? 'done' : ''}`}>{g.done && <Check size={13} />}</span>
                  <span>{g.text}</span>
                </div>
              ))}
              <Button variant="soft" icon={Plus} onClick={() => setShowAddGoal(true)}>Add a goal</Button>
            </div>
          </div>
          <div className="section-row">
            <div className="card">
              <div className="card-heading"><div><span className="label">Current programs</span><h3>Learning in motion</h3></div></div>
              {e.programs.map((p, i) => (
                <div className="program-row" key={i}>
                  <div className={`program-icon ${p.color}-bg`}><BookOpen size={19} /></div>
                  <div><strong>{p.name}</strong><span>{p.tutor} · Weekly</span></div>
                  <b>{p.pct}%</b>
                </div>
              ))}
            </div>
            <div className="card attendance-card">
              <span className="label">Attendance</span>
              <div className="attendance-number"><strong>{e.attendance}%</strong><span>this term</span></div>
              <div className="attendance-bars">{e.attendanceBars.map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div>
            </div>
          </div>
        </>
      )}
      {tab === 'attendance' && (
        <div className="card attendance-card">
          <span className="label">Attendance</span>
          <div className="attendance-number"><strong>{e.attendance}%</strong><span>this term</span></div>
          <div className="attendance-bars">{e.attendanceBars.map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div>
        </div>
      )}
      {tab === 'goals' && (
        <div className="card goals-card">
          <span className="label">Learning goals</span>
          <h3>What we're working towards</h3>
          {goals.map((g, i) => (
            <div className="goal" key={i}>
              <span className={`goal-check ${g.done ? 'done' : ''}`}>{g.done && <Check size={13} />}</span>
              <span>{g.text}</span>
            </div>
          ))}
          <Button variant="soft" icon={Plus} onClick={() => setShowAddGoal(true)}>Add a goal</Button>
        </div>
      )}
      {tab === 'sessions' && (
        <div className="card"><p className="empty-state-text">Session history will appear here.</p></div>
      )}
      {tab === 'notes' && (
        <div className="card"><p className="empty-state-text">No notes have been recorded yet. Tutor notes will appear here after each session.</p></div>
      )}
      {showAddGoal && (
        <div className="modal-backdrop" onClick={() => setShowAddGoal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowAddGoal(false)}><X size={18} /></button>
            <div className="modal-icon"><Plus size={22} /></div>
            <h2>Add a goal</h2>
            <p>Set a new learning goal for {child.name.split(' ')[0]}.</p>
            <div className="add-modal-form">
              <label>Goal text<input value={goalForm.text} onChange={e => setGoalForm({ ...goalForm, text: e.target.value })} placeholder="e.g. Build confidence with fractions" /></label>
              <label>Subject area
                <select value={goalForm.subject} onChange={e => setGoalForm({ ...goalForm, subject: e.target.value })}>
                  {['Mathematics', 'English', 'Reading & Spelling'].map(s => <option key={s}>{s}</option>)}
                </select>
              </label>
            </div>
            <Button onClick={handleAddGoal} icon={Check}>Save goal</Button>
            <button className="modal-cancel" onClick={() => setShowAddGoal(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
