import { Check, X } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { dataClient } from '../../../lib/data/client';
import { useAuth } from '../../../app/providers';
import { qk } from '../../../lib/data/queryKeys';
import { toAppError } from '../../../lib/data/errors';
import type { AttendanceRecord } from '../../../types/booking';

type Status = AttendanceRecord['status'];
const STATUS_OPTS: { value: Status; label: string }[] = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
];

export function TeacherAttendancePage() {
  return <TeacherAttendanceView />;
}

export function TeacherAttendanceView({ teacherIdOverride }: { teacherIdOverride?: string }) {
  const { teacherId: authTeacherId, loading: authLoading } = useAuth();
  const teacherId = teacherIdOverride ?? authTeacherId;
  const qc = useQueryClient();

  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const twoWeeksAgo = useMemo(() => new Date(Date.now() - 14 * 86400_000).toISOString(), []);
  const oneWeekAhead = useMemo(() => new Date(Date.now() + 7 * 86400_000).toISOString(), []);

  // Wait for auth to finish before deciding what teacherId to use
  const resolvedTeacherId = authLoading ? null : (teacherId || null);


  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: qk.sessions({ teacherId: resolvedTeacherId, from: twoWeeksAgo, to: oneWeekAhead }),
    queryFn: () => dataClient.getUpcomingSessions({ teacherId: resolvedTeacherId ?? undefined, from: twoWeeksAgo, to: oneWeekAhead }),
    enabled: !authLoading,
  });

  const activeSessionId = selectedSessionId || sessions[0]?.id || '';
  const activeSession = sessions.find(s => s.id === activeSessionId);

  const { data: existingAttendance = [] } = useQuery({
    queryKey: qk.attendance(activeSessionId),
    queryFn: () => dataClient.getAttendance(activeSessionId),
    enabled: !!activeSessionId,
  });

  useEffect(() => {
    if (!existingAttendance.length) return;
    const map: Record<string, Status> = {};
    existingAttendance.forEach((r: AttendanceRecord) => { map[r.child_id] = r.status; });
    setStatuses(map);
  }, [existingAttendance]);

  const { data: bookings = [] } = useQuery({
    queryKey: qk.teacherBookings,
    queryFn: () => dataClient.getBookingsForTeacher(),
    enabled: !authLoading,
  });

  const sessionBookings = bookings.filter(b => b.class_session_id === activeSessionId && b.status === 'confirmed');

  const saveAttendance = useMutation({
    mutationFn: () => dataClient.saveAttendance(
      activeSessionId,
      Object.entries(statuses).map(([childId, status]) => ({ childId, status }))
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.attendance(activeSessionId) });
      setSaved(true);
      setError('');
    },
    onError: (e) => setError(toAppError(e).message),
  });

  const handleReset = () => { setStatuses({}); setSaved(false); setError(''); };

  if (authLoading) return <div className="page-stack narrow-page"><p>Loading…</p></div>;

  return (
    <div className="page-stack narrow-page">
      <div className="page-toolbar">
        <div><h2>Take attendance</h2><p>Mark who attended this session.</p></div>
      </div>

      {sessions.length > 1 && (
        <div className="card" style={{ padding: '16px 20px' }}>
          <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Select session</label>
          <select
            value={activeSessionId}
            onChange={e => { setSelectedSessionId(e.target.value); setStatuses({}); setSaved(false); }}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 13 }}
          >
            {sessions.map(s => {
              const d = new Date(s.starts_at);
              return (
                <option key={s.id} value={s.id}>
                  {s.subject} · {d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })} {d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}
                </option>
              );
            })}
          </select>
        </div>
      )}

      {sessionsLoading && (
        <div className="card" style={{ padding: 20 }}>
          <p className="empty-state-text">Loading sessions…</p>
        </div>
      )}

      {!sessionsLoading && sessions.length === 0 && (
        <div className="card" style={{ padding: 20 }}>
          <p className="empty-state-text">No sessions found in the past 2 weeks or upcoming week.</p>
        </div>
      )}

      {saved ? (
        <div className="card" style={{ textAlign: 'center', padding: '32px 24px' }}>
          <div className="success-mark"><Check size={27} /></div>
          <h3>Attendance saved</h3>
          {activeSession && (
            <p>Attendance for {activeSession.subject} · {new Date(activeSession.starts_at).toLocaleDateString('en-AU')} has been recorded.</p>
          )}
          <Button onClick={handleReset}>Mark another session</Button>
        </div>
      ) : activeSession ? (
        <div className="card">
          <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--line)' }}>
            <span className="label">{activeSession.subject}</span>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
              {new Date(activeSession.starts_at).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })} · {sessionBookings.length} students
            </p>
          </div>
          {error && <p className="auth-error">{error}</p>}
          {sessionBookings.length === 0 && <p className="empty-state-text">No confirmed bookings for this session.</p>}
          <div className="attendance-modal-list">
            {sessionBookings.map(b => {
              const child = b.child;
              if (!child) return null;
              return (
                <div className="attendance-modal-row" key={child.id}>
                  <div className="mini-avatar pink-bg">{child.initials}</div>
                  <strong>{child.name}</strong>
                  <div className="attendance-status-control">
                    {STATUS_OPTS.map(opt => (
                      <button
                        key={opt.value}
                        className={`attendance-status-btn ${opt.value.replace('_', '')} ${statuses[child.id] === opt.value ? 'active' : ''}`}
                        onClick={() => setStatuses({ ...statuses, [child.id]: opt.value })}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {sessionBookings.length > 0 && (
            <div className="review-actions">
              <Button variant="ghost" onClick={handleReset} icon={X}>Reset</Button>
              <Button onClick={() => saveAttendance.mutate()} icon={Check} disabled={saveAttendance.isPending}>
                {saveAttendance.isPending ? 'Saving…' : 'Save Attendance'}
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
