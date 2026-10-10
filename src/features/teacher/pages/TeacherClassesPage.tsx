import { useQuery } from '@tanstack/react-query';
import { Progress } from '../../../components/ui/Progress';
import { dataClient } from '../../../lib/data/client';
import { useAuth } from '../../../app/providers';
import { qk } from '../../../lib/data/queryKeys';
import { formatMoney } from '../../../lib/utils/money';

// Classes are managed exclusively by admins in the Timetable page.
// Teachers can only view the classes they have been assigned to.

const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function TeacherClassesPage() {
  const { teacherId } = useAuth();

  const { data: slots = [], isLoading } = useQuery({
    queryKey: qk.classSlots,
    queryFn: () => dataClient.getClassSlots(),
    enabled: !!teacherId,
  });

  const mySlots = slots.filter(s => s.teacher_id === teacherId && s.is_active);

  if (isLoading) return <div className="page-stack"><p style={{ color: 'var(--muted)' }}>Loading…</p></div>;

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div>
          <h2>My classes</h2>
          <p>Classes assigned to you by admin.</p>
        </div>
      </div>

      {mySlots.length === 0 && (
        <div className="card" style={{ padding: 20 }}>
          <p className="empty-state-text">No classes assigned yet. Contact admin to be added to the timetable.</p>
        </div>
      )}

      <div className="admin-class-grid">
        {mySlots.map(s => (
          <div className={`card admin-class ${s.teacher_color ?? 'pink'}`} key={s.id}>
            <div className="class-card-top">
              <span className="class-subject">{s.subject}</span>
            </div>
            <h3>{DAYS[s.day_of_week] ?? '—'}</h3>
            <strong>{s.start_time}</strong>
            <div className="capacity">
              <span>Enrolled</span>
              <b>{s.next_booked_count} / {s.capacity}</b>
              <Progress value={(s.next_booked_count / s.capacity) * 100} color={s.teacher_color ?? 'pink'} />
            </div>
            {s.price_cents !== undefined && (
              <div className="review-detail-row">
                <span>Class price</span>
                <b>{formatMoney(s.price_cents)}</b>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
