import { CalendarDays, Check, Clock3, ClipboardList, UserRound } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { dataClient } from '../../../lib/data/client';
import { useAuth } from '../../../app/providers';
import { qk } from '../../../lib/data/queryKeys';
import type { Assessment } from '../../../types/booking';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STATUS_LABEL: Record<Assessment['status'], string> = {
  awaiting_payment: 'Awaiting payment',
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_CLASS: Record<Assessment['status'], string> = {
  awaiting_payment: 'pending',
  scheduled: 'confirmed',
  completed: 'done',
  cancelled: 'cancelled',
};

function toTimeLabel(t: string) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function AssessmentCard({ a }: { a: Assessment }) {
  const child = (a as any).child;
  const teacher = (a as any).teacher;
  const isTermAssessment = !a.payment_id;

  let dateBlock: React.ReactNode = null;
  if (a.scheduled_date) {
    const d = new Date(a.scheduled_date + 'T00:00:00');
    dateBlock = (
      <div className="booking-date">
        <span>{DAYS[d.getDay()]}</span>
        <strong>{d.getDate()}</strong>
        <small>{MONTHS[d.getMonth()]}</small>
      </div>
    );
  } else {
    dateBlock = (
      <div className="booking-date" style={{ background: 'var(--surface-2, #f5f5f5)' }}>
        <span style={{ fontSize: 10 }}>TBC</span>
        <strong>—</strong>
      </div>
    );
  }

  return (
    <div className={`card booking-card ${isTermAssessment ? 'teal' : 'pink'}`}>
      {dateBlock}
      <div className="booking-main">
        <span className="label">{isTermAssessment ? 'Term assessment' : 'Initial assessment'}</span>
        <h3>{isTermAssessment ? 'Progress check-in' : 'Initial Learning Assessment'}</h3>
        {a.scheduled_time && (
          <p><Clock3 size={15} />{toTimeLabel(a.scheduled_time)}</p>
        )}
        {teacher?.name && (
          <p><UserRound size={15} />with {teacher.name}</p>
        )}
        {child?.name && (
          <p><ClipboardList size={15} />{child.name}</p>
        )}
        {a.notes && (
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>"{a.notes}"</p>
        )}
      </div>
      <div className="booking-right">
        <span className={`status ${STATUS_CLASS[a.status]}`}>
          {a.status === 'scheduled' && <Check size={13} />}
          {STATUS_LABEL[a.status]}
        </span>
      </div>
    </div>
  );
}

export function AssessmentsPage() {
  const { familyId } = useAuth();
  const navigate = useNavigate();

  const { data: assessments = [], isLoading } = useQuery({
    queryKey: qk.assessments(familyId),
    queryFn: () => dataClient.getAssessments(familyId),
    enabled: !!familyId,
  });

  const upcoming = assessments.filter(a =>
    a.status !== 'cancelled' && a.status !== 'completed'
  ).sort((a, b) => {
    if (!a.scheduled_date) return 1;
    if (!b.scheduled_date) return -1;
    return a.scheduled_date.localeCompare(b.scheduled_date);
  });

  const past = assessments.filter(a =>
    a.status === 'completed' || a.status === 'cancelled'
  ).sort((a, b) => {
    if (!a.scheduled_date) return 1;
    if (!b.scheduled_date) return -1;
    return b.scheduled_date.localeCompare(a.scheduled_date);
  });

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div>
          <h2>Your assessments</h2>
          <p>Track upcoming and past assessments for your children.</p>
        </div>
        <Button icon={CalendarDays} onClick={() => navigate('/parent/book-assessment')}>
          Book assessment
        </Button>
      </div>

      {isLoading && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</p>}

      {!isLoading && assessments.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '32px 24px' }}>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
            No assessments yet. Book an initial assessment to get started.
          </p>
          <Button icon={CalendarDays} onClick={() => navigate('/parent/book-assessment')}>
            Book an assessment
          </Button>
        </div>
      )}

      {upcoming.length > 0 && (
        <>
          <div className="section-label" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Upcoming
          </div>
          <div className="booking-cards">
            {upcoming.map(a => <AssessmentCard key={a.id} a={a} />)}
          </div>
        </>
      )}

      {past.length > 0 && (
        <>
          <div className="section-label" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8 }}>
            Past
          </div>
          <div className="booking-cards">
            {past.map(a => <AssessmentCard key={a.id} a={a} />)}
          </div>
        </>
      )}
    </div>
  );
}
