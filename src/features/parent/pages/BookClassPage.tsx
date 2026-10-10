import { ArrowRight, Check, CircleDollarSign, Users, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { TermCreditMeter } from '../../../components/domain/TermCreditMeter';
import { useBookingEligibility } from '../hooks/useBookingEligibility';
import { useAuth } from '../../../app/providers';
import { dataClient } from '../../../lib/data/client';
import { qk } from '../../../lib/data/queryKeys';
import { toAppError } from '../../../lib/data/errors';
import type { ClassSession } from '../../../types/teacher';

const COLORS: Record<string, string> = { Mathematics: 'pink', English: 'teal', Reading: 'orange' };

export function BookClassPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { familyId } = useAuth();
  const { gatingState, activeTerm, isLoading } = useBookingEligibility(familyId);

  const { data: children = [] } = useQuery({
    queryKey: qk.children(familyId),
    queryFn: () => dataClient.getChildren(familyId),
    enabled: !!familyId,
  });
  const enrolledChildren = children.filter(c => c.enrolled);

  const weekTo = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);

  const { data: sessions = [], isLoading: loadingSessions } = useQuery({
    queryKey: qk.sessions({ to: weekTo }),
    queryFn: () => dataClient.getUpcomingSessions({ to: weekTo, from: new Date().toISOString() }),
    enabled: !isLoading,
  });

  const { data: bookings = [] } = useQuery({
    queryKey: qk.bookings(familyId),
    queryFn: () => dataClient.getBookings(familyId),
    enabled: !!familyId,
  });

  const [selectedChildIdx, setSelectedChildIdx] = useState(0);
  const selectedChild = enrolledChildren[selectedChildIdx];
  const [confirming, setConfirming] = useState<ClassSession | null>(null);
  const [bookError, setBookError] = useState('');

  const hasTerm = gatingState === 'ACTIVE_TERM';

  const bookMutation = useMutation({
    mutationFn: (session: ClassSession) => dataClient.bookClassSession(selectedChild!.id, session.id),
    onSuccess: (_, session) => {
      qc.invalidateQueries({ queryKey: qk.bookings(familyId) });
      qc.invalidateQueries({ queryKey: qk.sessions() });
      qc.invalidateQueries({ queryKey: qk.terms(familyId) });
      setConfirming(null);
      setBookError('');
      if (session.teacher_id && familyId) {
        dataClient.startConversation('parent_teacher', { familyId, teacherId: session.teacher_id })
          .then(() => qc.invalidateQueries({ queryKey: qk.conversations }))
          .catch(() => {});
      }
    },
    onError: (e) => setBookError(toAppError(e).message),
  });

  if (isLoading) return <div className="page-stack"><p>Loading…</p></div>;

  if (enrolledChildren.length === 0) {
    return (
      <div className="page-stack">
        <div className="page-toolbar"><div><h2>Book a class</h2><p>Choose a session for your child.</p></div></div>
        <div className="enrol-gate-banner">
          <div className="enrol-gate-icon">🎒</div>
          <div>
            <strong>No enrolled children yet</strong>
            <span>{children.length > 0 ? `You have ${children.length} child${children.length > 1 ? 'ren' : ''} added but none enrolled yet.` : 'Add and enrol a child to get started.'}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {children.length === 0 && <Button variant="secondary" onClick={() => navigate('/parent/children')} icon={ArrowRight}>Add a child</Button>}
            <Button onClick={() => navigate('/parent/enrol')} icon={ArrowRight}>Enrol now</Button>
          </div>
        </div>
      </div>
    );
  }

  const childFirstName = selectedChild?.givenName || selectedChild?.name.split(' ')[0] || 'your child';

  // Sessions already booked for the selected child
  const bookedSessionIds = new Set(
    bookings
      .filter(b => b.child_id === selectedChild?.id && b.status === 'confirmed')
      .map(b => b.class_session_id)
  );

  return (
    <div className="page-stack">
      {enrolledChildren.length > 1 && (
        <div className="child-switcher">
          {enrolledChildren.map((c, i) => (
            <button key={c.id} className={selectedChildIdx === i ? 'active' : ''} onClick={() => setSelectedChildIdx(i)}>
              <span className="switcher-avatar">{c.initials}</span>
              <span className="switcher-name">{c.givenName || c.name.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      )}

      <div className="page-toolbar">
        <div><h2>Book a class</h2><p>Choose a session for {childFirstName}.</p></div>
      </div>

      {hasTerm && activeTerm && <TermCreditMeter term={activeTerm} />}

      {!hasTerm && (
        <div className="unlock-banner">
          <CircleDollarSign size={20} />
          <div>
            <strong>{gatingState === 'TERM_EXPIRED' ? 'Your term has expired' : 'No term purchased yet'}</strong>
            <span>{gatingState === 'TERM_EXPIRED' ? 'Renew your term to continue booking classes.' : 'Purchase a term to start booking classes for your children.'}</span>
          </div>
          <Button onClick={() => navigate('/parent/payments')} variant="secondary" icon={ArrowRight}>
            {gatingState === 'TERM_EXPIRED' ? 'Renew term' : 'Purchase term'}
          </Button>
        </div>
      )}

      {loadingSessions && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading classes…</p>}

      <div className="classes-list">
        {sessions.map(session => {
          const isBooked = bookedSessionIds.has(session.id);
          const isFull = session.spaces_left === 0;
          const color = COLORS[session.subject] ?? 'yellow';
          const d = new Date(session.starts_at);
          const dayName = d.toLocaleDateString('en-AU', { weekday: 'long' });
          const timeStr = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });

          return (
            <div className={`class-card ${color} ${isBooked ? 'booked' : ''}`} key={session.id}>
              <div className="class-card-top">
                <span className="class-subject">{session.subject.toUpperCase()}</span>
                <span className={`space-badge ${isFull ? 'full-badge' : ''}`}>
                  {isFull ? 'FULL' : `${session.spaces_left} space${session.spaces_left !== 1 ? 's' : ''} available`}
                </span>
              </div>
              <div className="class-card-when"><h3>{dayName}</h3><span>{timeStr}</span></div>
              <div className="class-tutor">
                <div className={`mini-avatar ${color}-bg`}>{session.teacher_name.split(' ').map(p => p[0]).join('')}</div>
                <span>with <b>{session.teacher_name}</b></span>
              </div>
              {isBooked ? (
                <div className="booked-confirm"><Check size={16} /> Booked</div>
              ) : isFull ? (
                <Button variant="soft" disabled><Users size={15} /> Class full</Button>
              ) : hasTerm ? (
                <Button onClick={() => { setConfirming(session); setBookError(''); }} icon={Check}>
                  Confirm booking
                </Button>
              ) : (
                <Button variant="soft" disabled><CircleDollarSign size={15} /> Purchase term first</Button>
              )}
            </div>
          );
        })}
        {!loadingSessions && sessions.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '32px 24px' }}>
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>No upcoming sessions available right now.</p>
          </div>
        )}
      </div>

      {confirming && (
        <div className="modal-backdrop" onClick={() => setConfirming(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setConfirming(null)}><X size={18} /></button>
            <div className="modal-icon"><Check size={22} /></div>
            <h2>Confirm booking</h2>
            <p>This will use one session from your active term.</p>
            <div className="review-details">
              <div className="review-detail-row"><span>Child</span><b>{selectedChild?.name ?? '—'}</b></div>
              <div className="review-detail-row"><span>Subject</span><b>{confirming.subject}</b></div>
              <div className="review-detail-row"><span>Date</span><b>{new Date(confirming.starts_at).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}</b></div>
              <div className="review-detail-row"><span>Time</span><b>{new Date(confirming.starts_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}</b></div>
              <div className="review-detail-row"><span>Tutor</span><b>{confirming.teacher_name}</b></div>
            </div>
            {bookError && <p className="auth-error">{bookError}</p>}
            <Button
              disabled={bookMutation.isPending}
              onClick={() => bookMutation.mutate(confirming)}
              icon={Check}
            >
              {bookMutation.isPending ? 'Booking…' : 'Yes, confirm booking'}
            </Button>
            <button className="modal-cancel" onClick={() => setConfirming(null)}>Not now</button>
          </div>
        </div>
      )}
    </div>
  );
}
