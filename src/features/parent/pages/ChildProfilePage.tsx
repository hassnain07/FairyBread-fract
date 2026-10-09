import { ArrowRight, Check, Download, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { dataClient } from '../../../lib/data/client';
import { useAuth } from '../../../app/providers';
import { qk } from '../../../lib/data/queryKeys';
import { toAppError } from '../../../lib/data/errors';

type Tab = 'overview' | 'goals' | 'attendance' | 'sessions' | 'notes';

const STATUS_COLORS: Record<string, string> = {
  present: 'green', late: 'yellow', absent: 'orange', no_show: 'orange',
};

export function ChildProfilePage() {
  const { childId } = useParams<{ childId: string }>();
  const { familyId } = useAuth();
  const qc = useQueryClient();

  const { data: children = [] } = useQuery({
    queryKey: qk.children(familyId),
    queryFn: () => dataClient.getChildren(familyId),
    enabled: !!familyId,
  });

  const child = children.find(c => c.id === childId) ?? children[0];

  const { data: attendance = [] } = useQuery({
    queryKey: qk.childAttendance(child?.id ?? ''),
    queryFn: () => dataClient.getChildAttendance(child!.id),
    enabled: !!child?.id,
  });

  const { data: reports = [] } = useQuery({
    queryKey: qk.reports(child?.id ?? ''),
    queryFn: () => dataClient.getReportsForChild(child!.id),
    enabled: !!child?.id,
  });

  const { data: bookings = [] } = useQuery({
    queryKey: qk.bookings(familyId),
    queryFn: () => dataClient.getBookings(familyId),
    enabled: !!familyId,
  });

  const [tab, setTab] = useState<Tab>('overview');
  const [goalText, setGoalText] = useState(child?.goals ?? '');
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [goalForm, setGoalForm] = useState('');
  const [saveError, setSaveError] = useState('');

  const saveGoals = useMutation({
    mutationFn: (goals: string) => dataClient.updateChild(child!.id, { goals }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.children(familyId) });
      setShowAddGoal(false);
      setSaveError('');
    },
    onError: (e) => setSaveError(toAppError(e).message),
  });

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' }, { key: 'goals', label: 'Goals' },
    { key: 'attendance', label: 'Attendance' }, { key: 'sessions', label: 'Sessions' }, { key: 'notes', label: 'Notes' },
  ];

  if (!child) return <div className="page-stack"><p>Loading...</p></div>;

  const latestReport = reports.length > 0 ? reports[reports.length - 1] : null;
  const presentCount = attendance.filter(a => a.status === 'present' || a.status === 'late').length;
  const attendancePct = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : null;

  const childBookings = bookings.filter(b => b.child_id === child.id && b.status === 'confirmed' && b.session);

  const handleAddGoal = () => {
    if (!goalForm.trim()) return;
    const updated = goalText ? `${goalText}\n${goalForm.trim()}` : goalForm.trim();
    setGoalText(updated);
    saveGoals.mutate(updated);
    setGoalForm('');
  };

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
                <div><span className="label">Progress snapshot</span><h3>Latest report</h3></div>
              </div>
              {latestReport ? (
                <>
                  <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>{latestReport.term}</p>
                  {latestReport.subjects.map(s => (
                    <div className="subject-progress" key={s.subject}>
                      <div><span className="subject-dot pink-dot" />{s.subject} <b>{s.rating * 20}%</b></div>
                      <div style={{ height: 6, background: 'var(--line)', borderRadius: 3, marginTop: 4 }}>
                        <div style={{ height: '100%', width: `${s.rating * 20}%`, background: 'var(--pink)', borderRadius: 3 }} />
                      </div>
                    </div>
                  ))}
                  {latestReport.subjects.length === 0 && (
                    <p style={{ fontSize: 13, color: 'var(--muted)' }}>Overall: {latestReport.overall}/5</p>
                  )}
                </>
              ) : (
                <p className="empty-state-text">No reports yet.</p>
              )}
            </div>
            <div className="card attendance-card">
              <span className="label">Attendance</span>
              {attendancePct !== null ? (
                <>
                  <div className="attendance-number"><strong>{attendancePct}%</strong><span>this term</span></div>
                  <div className="attendance-bars">
                    {attendance.slice(-6).map((a, i) => (
                      <i key={i} style={{ height: `${a.status === 'present' ? 100 : a.status === 'late' ? 70 : 30}%`, background: `var(--${STATUS_COLORS[a.status] ?? 'muted'})` }} />
                    ))}
                  </div>
                </>
              ) : (
                <p className="empty-state-text">No attendance recorded yet.</p>
              )}
            </div>
          </div>
          {latestReport?.note && (
            <div className="card notice-card">
              <div className="notice-icon"><span>✦</span></div>
              <span className="label">Latest tutor note</span>
              <p>"{latestReport.note}"</p>
            </div>
          )}
        </>
      )}

      {tab === 'goals' && (
        <div className="card goals-card">
          <span className="label">Learning goals</span>
          <h3>What we're working towards</h3>
          {goalText ? (
            goalText.split('\n').filter(Boolean).map((g, i) => (
              <div className="goal" key={i}>
                <span className="goal-check" />
                <span>{g}</span>
              </div>
            ))
          ) : (
            <p className="empty-state-text">No goals set yet.</p>
          )}
          {saveError && <p className="auth-error">{saveError}</p>}
          <Button variant="soft" icon={Plus} onClick={() => setShowAddGoal(true)}>Add a goal</Button>
        </div>
      )}

      {tab === 'attendance' && (
        <div className="card">
          <div className="card-heading"><div><span className="label">Attendance history</span><h3>Session by session</h3></div></div>
          {attendance.length === 0 ? (
            <p className="empty-state-text">No attendance recorded yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {attendance.map((a, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                  <span style={{ color: 'var(--muted)' }}>Session {i + 1}</span>
                  <span className={`table-status ${a.status === 'present' ? 'confirmed' : 'cancelled'}`}>
                    {a.status.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'sessions' && (
        <div className="card">
          <div className="card-heading"><div><span className="label">Upcoming sessions</span><h3>Booked classes</h3></div></div>
          {childBookings.length === 0 ? (
            <p className="empty-state-text">No upcoming sessions booked.</p>
          ) : (
            childBookings
              .filter(b => b.session && new Date(b.session.starts_at) > new Date())
              .sort((a, b) => new Date(a.session!.starts_at).getTime() - new Date(b.session!.starts_at).getTime())
              .map(b => (
                <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                  <span><strong>{b.session!.subject}</strong></span>
                  <span style={{ color: 'var(--muted)' }}>{new Date(b.session!.starts_at).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                </div>
              ))
          )}
        </div>
      )}

      {tab === 'notes' && (
        <div className="card">
          {child.notes ? (
            <>
              <span className="label">About this student</span>
              <p style={{ fontSize: 14, marginTop: 8 }}>{child.notes}</p>
            </>
          ) : (
            <p className="empty-state-text">No notes have been recorded yet. Tutor notes will appear here after each session.</p>
          )}
        </div>
      )}

      {showAddGoal && (
        <div className="modal-backdrop" onClick={() => setShowAddGoal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowAddGoal(false)}><X size={18} /></button>
            <div className="modal-icon"><Plus size={22} /></div>
            <h2>Add a goal</h2>
            <p>Set a new learning goal for {child.name.split(' ')[0]}.</p>
            <div className="add-modal-form">
              <label>Goal<input value={goalForm} onChange={e => setGoalForm(e.target.value)} placeholder="e.g. Build confidence with fractions" /></label>
            </div>
            <Button onClick={handleAddGoal} icon={Check} disabled={saveGoals.isPending}>
              {saveGoals.isPending ? 'Saving…' : 'Save goal'}
            </Button>
            <button className="modal-cancel" onClick={() => setShowAddGoal(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
