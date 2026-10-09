import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardList, Plus, X } from 'lucide-react';
import { dataClient } from '../../../lib/data/client';
import { useAuth } from '../../../app/providers';
import { Button } from '../../../components/ui/Button';
import { qk } from '../../../lib/data/queryKeys';
import { toAppError } from '../../../lib/data/errors';

const TIMES = ['3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM', '5:00 PM'];

function fmtDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function TeacherAssessmentsPage() {
  return <TeacherAssessmentsView />;
}

export function TeacherAssessmentsView({ teacherIdOverride }: { teacherIdOverride?: string }) {
  const { teacherId: authTeacherId } = useAuth();
  const teacherId = teacherIdOverride ?? authTeacherId;
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ sessionId: '', date: '', time: '3:30 PM' });
  const [error, setError] = useState('');

  const twoWeeksAgo = new Date(Date.now() - 14 * 86400_000).toISOString();
  const fourWeeksAhead = new Date(Date.now() + 28 * 86400_000).toISOString();

  const { data: sessions = [] } = useQuery({
    queryKey: qk.sessions({ teacherId, from: twoWeeksAgo, to: fourWeeksAhead }),
    queryFn: () => dataClient.getUpcomingSessions({ teacherId, from: twoWeeksAgo, to: fourWeeksAhead }),
    enabled: !!teacherId,
  });

  const { data: bookings = [] } = useQuery({
    queryKey: qk.teacherBookings,
    queryFn: () => dataClient.getBookingsForTeacher(),
    enabled: !!teacherId,
  });

  const { data: assessments = [], isLoading } = useQuery({
    queryKey: qk.teacherAssessments,
    queryFn: () => dataClient.getTeacherAssessments(),
    enabled: !!teacherId,
  });

  // Sessions that already have assessments scheduled
  const assessedSessionIds = new Set(assessments.map(a => a.class_id).filter(Boolean));

  const { mutate: create, isPending } = useMutation({
    mutationFn: async () => {
      if (!form.sessionId || !form.date) throw new Error('Please select a session and date.');
      const sessionBookings = bookings.filter(b => b.class_session_id === form.sessionId && b.status === 'confirmed');
      if (sessionBookings.length === 0) throw new Error('No confirmed students in this session.');
      return dataClient.createTeacherAssessments(
        sessionBookings.map(b => ({
          childId: b.child_id,
          classId: form.sessionId,
          date: form.date,
          time: form.time,
        }))
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.teacherAssessments });
      setForm({ sessionId: '', date: '', time: '3:30 PM' });
      setShowAdd(false);
      setError('');
    },
    onError: (e) => setError(toAppError(e).message),
  });

  const markComplete = useMutation({
    mutationFn: (id: string) => dataClient.updateAssessment(id, { status: 'completed' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.teacherAssessments }),
  });

  // Group assessments by class_id (session)
  const bySession = sessions
    .map(session => {
      const rows = assessments.filter(a => a.class_id === session.id);
      if (rows.length === 0) return null;
      const first = rows[0];
      const allComplete = rows.every(a => a.status === 'completed');
      return { session, rows, date: first.scheduled_date, time: first.scheduled_time, allComplete };
    })
    .filter(Boolean) as { session: typeof sessions[0]; rows: typeof assessments; date?: string; time?: string; allComplete: boolean }[];

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div><h2>Assessments</h2><p>Schedule assessments for your classes.</p></div>
        <Button icon={Plus} onClick={() => { setShowAdd(true); setError(''); }}>Schedule assessment</Button>
      </div>

      {isLoading ? (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>Loading…</p>
      ) : bySession.length === 0 ? (
        <div className="card" style={{ padding: 20 }}>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>No assessments scheduled yet.</p>
        </div>
      ) : (
        bySession.map(({ session, rows, date, time, allComplete }) => (
          <div className="card admin-class pink" key={session.id} style={{ gap: 10 }}>
            <div className="class-card-top">
              <span className="class-subject">{session.subject}</span>
              <span className={`status-badge ${allComplete ? 'green' : 'yellow'}`}>
                {allComplete ? 'Complete' : 'Pending'}
              </span>
            </div>
            <h3>{new Date(session.starts_at).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}</h3>
            <div className="review-detail-row">
              <span>Assessment date</span>
              <b>{date ? fmtDate(date) : '—'} at {time ?? '—'}</b>
            </div>
            <div className="review-detail-row">
              <span>Students</span>
              <b>{rows.length}</b>
            </div>
            {!allComplete && (
              <button
                className="text-link"
                onClick={() => rows.forEach(a => a.status !== 'completed' && markComplete.mutate(a.id))}
              >
                Mark all complete
              </button>
            )}
          </div>
        ))
      )}

      {showAdd && (
        <div className="modal-backdrop" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowAdd(false)}><X size={18} /></button>
            <div className="modal-icon"><ClipboardList size={22} /></div>
            <h2>Schedule assessment</h2>
            {error && <p className="auth-error">{error}</p>}
            <div className="add-modal-form">
              <label>Session
                <select value={form.sessionId} onChange={e => setForm({ ...form, sessionId: e.target.value })}>
                  <option value="">Select session…</option>
                  {sessions.map(s => {
                    const d = new Date(s.starts_at);
                    const label = `${s.subject} — ${d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}`;
                    return (
                      <option key={s.id} value={s.id} disabled={assessedSessionIds.has(s.id)}>
                        {label}{assessedSessionIds.has(s.id) ? ' (scheduled)' : ''}
                      </option>
                    );
                  })}
                </select>
              </label>
              {form.sessionId && (
                <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: -4 }}>
                  {bookings.filter(b => b.class_session_id === form.sessionId && b.status === 'confirmed').length} enrolled students will be assessed.
                </p>
              )}
              <label>Date<input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
              <label>Time
                <select value={form.time} onChange={e => setForm({ ...form, time: e.target.value })}>
                  {TIMES.map(t => <option key={t}>{t}</option>)}
                </select>
              </label>
            </div>
            <div className="review-actions">
              <Button variant="ghost" onClick={() => setShowAdd(false)} icon={X}>Cancel</Button>
              <Button onClick={() => create()} icon={Check} disabled={!form.sessionId || !form.date || isPending}>
                {isPending ? 'Saving…' : 'Schedule'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
