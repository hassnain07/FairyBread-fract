import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dataClient } from '../../../lib/data/client';
import { useAuth } from '../../../app/providers';
import { qk } from '../../../lib/data/queryKeys';

function fmtDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function TeacherAssessmentsPage() {
  return <TeacherAssessmentsView />;
}

export function TeacherAssessmentsView({ teacherIdOverride }: { teacherIdOverride?: string }) {
  const { teacherId: authTeacherId, loading: authLoading } = useAuth();
  const teacherId = teacherIdOverride ?? authTeacherId;
  const qc = useQueryClient();

  const twoWeeksAgo = useMemo(() => new Date(Date.now() - 14 * 86400_000).toISOString(), []);
  const fourWeeksAhead = useMemo(() => new Date(Date.now() + 28 * 86400_000).toISOString(), []);

  const { data: sessions = [] } = useQuery({
    queryKey: qk.sessions({ teacherId, from: twoWeeksAgo, to: fourWeeksAhead }),
    queryFn: () => dataClient.getUpcomingSessions({ teacherId, from: twoWeeksAgo, to: fourWeeksAhead }),
    enabled: !authLoading,
  });

  // Teacher sees only term assessments assigned to them (payment_id is null)
  const { data: assessments = [], isLoading } = useQuery({
    queryKey: qk.adminTermAssessments,
    queryFn: () => dataClient.getAdminTermAssessments!(),
    enabled: !authLoading,
  });

  // Filter to only this teacher's assessments
  const myAssessments = assessments.filter(a => a.teacher_id === teacherId);

  const markComplete = useMutation({
    mutationFn: (id: string) => dataClient.updateAssessment(id, { status: 'completed' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.adminTermAssessments }),
  });

  // Group by session (class_id)
  const bySession = sessions
    .map(session => {
      const rows = myAssessments.filter(a => a.class_id === session.id);
      if (rows.length === 0) return null;
      const first = rows[0];
      const allComplete = rows.every(a => a.status === 'completed');
      return { session, rows, date: first.scheduled_date, time: first.scheduled_time, allComplete };
    })
    .filter(Boolean) as { session: typeof sessions[0]; rows: typeof assessments; date?: string; time?: string; allComplete: boolean }[];

  // Also show assessments not linked to a session (scheduled by admin with no class_id)
  const unlinked = myAssessments.filter(a => !a.class_id);

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div><h2>Assessments</h2><p>Assessments scheduled for your students this term.</p></div>
      </div>

      {isLoading ? (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>Loading…</p>
      ) : bySession.length === 0 && unlinked.length === 0 ? (
        <div className="card" style={{ padding: 20 }}>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>No assessments scheduled for you yet.</p>
        </div>
      ) : (
        <>
          {bySession.map(({ session, rows, date, time, allComplete }) => (
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
              <div className="review-detail-row"><span>Students</span><b>{rows.length}</b></div>
              {!allComplete && (
                <button className="text-link" onClick={() => rows.forEach(a => a.status !== 'completed' && markComplete.mutate(a.id))}>
                  Mark all complete
                </button>
              )}
            </div>
          ))}
          {unlinked.map(a => {
            const child = (a as any).child;
            return (
              <div className="card admin-class pink" key={a.id} style={{ gap: 10 }}>
                <div className="class-card-top">
                  <span className="class-subject">{child?.name ?? a.child_id}</span>
                  <span className={`status-badge ${a.status === 'completed' ? 'green' : 'yellow'}`}>
                    {a.status === 'completed' ? 'Complete' : 'Pending'}
                  </span>
                </div>
                {a.scheduled_date && (
                  <div className="review-detail-row">
                    <span>Assessment date</span>
                    <b>{fmtDate(a.scheduled_date)} at {a.scheduled_time ?? '—'}</b>
                  </div>
                )}
                {a.status !== 'completed' && (
                  <button className="text-link" onClick={() => markComplete.mutate(a.id)}>Mark complete</button>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
