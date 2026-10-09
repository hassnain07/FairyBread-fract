import { ArrowRight, Check, CircleDollarSign, CreditCard, Ticket, Users, X } from 'lucide-react';
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
  const { gatingState, canBookRegularClass, canBookIndividualClass, classesRemaining, activeTerm, isLoading } = useBookingEligibility(familyId);

  const { data: children = [] } = useQuery({
    queryKey: qk.children(familyId),
    queryFn: () => dataClient.getChildren(familyId),
    enabled: !!familyId,
  });
  const enrolledChildren = children.filter(c => c.enrolled);

  const { data: sessions = [], isLoading: loadingSessions } = useQuery({
    queryKey: qk.sessions(),
    queryFn: () => dataClient.getUpcomingSessions(),
    enabled: !isLoading,
  });

  const [selectedChildIdx, setSelectedChildIdx] = useState(0);
  const selectedChild = enrolledChildren[selectedChildIdx];
  const [bookingMode, setBookingMode] = useState<'term' | 'individual'>('term');
  const [confirming, setConfirming] = useState<ClassSession | null>(null);
  const [bookError, setBookError] = useState('');
  const [bookedSessionId, setBookedSessionId] = useState<string | null>(null);

  const bookMutation = useMutation({
    mutationFn: (sessionId: string) => dataClient.bookClassSession(selectedChild!.id, sessionId),
    onSuccess: (_, sessionId) => {
      qc.invalidateQueries({ queryKey: qk.bookings(familyId) });
      qc.invalidateQueries({ queryKey: qk.terms(familyId) });
      qc.invalidateQueries({ queryKey: ['gating', familyId] });
      qc.invalidateQueries({ queryKey: qk.sessions() });
      setBookedSessionId(sessionId);
      setConfirming(null);
      setBookError('');
    },
    onError: (e) => setBookError(toAppError(e).message),
  });

  if (isLoading) return <div className="page-stack"><p>Loading…</p></div>;

  const usingCredit = bookingMode === 'term' && canBookRegularClass;

  if (enrolledChildren.length === 0) {
    return (
      <div className="page-stack">
        <div className="page-toolbar"><div><h2>Book a class</h2><p>Choose a session for your child this week.</p></div></div>
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

  return (
    <div className="page-stack">
      <div className="child-switcher">
        {enrolledChildren.map((c, i) => (
          <button key={c.id} className={selectedChildIdx === i ? 'active' : ''} onClick={() => { setSelectedChildIdx(i); setBookedSessionId(null); }}>
            <span className="switcher-avatar">{c.initials}</span>
            <span className="switcher-name">{c.givenName || c.name.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      <div className="page-toolbar">
        <div><h2>Book a class</h2><p>Choose a session for {childFirstName} this week.</p></div>
        {activeTerm && <div className="booking-count"><span>{classesRemaining} of {activeTerm.classes_included}</span> credits remaining</div>}
      </div>

      {gatingState === 'NO_TERM_EVER' && (
        <div className="unlock-banner">
          <CircleDollarSign size={20} />
          <div>
            <strong>Purchase a term to use class credits</strong>
            <span>Individual classes unlock after your first term purchase.</span>
          </div>
          <Button onClick={() => navigate('/parent/payments')} variant="secondary">Purchase term</Button>
        </div>
      )}
      {gatingState === 'TERM_EXPIRED' && (
        <div className="unlock-banner">
          <CircleDollarSign size={20} />
          <div><strong>Your term has expired</strong><span>Renew your term to use credits again, or book individual classes.</span></div>
          <Button onClick={() => navigate('/parent/payments')} variant="secondary">Renew term</Button>
        </div>
      )}
      {gatingState === 'ACTIVE_TERM' && classesRemaining === 0 && (
        <div className="unlock-banner">
          <CircleDollarSign size={20} />
          <div><strong>All {activeTerm?.classes_included} credits used</strong><span>Book individual classes or renew your term early.</span></div>
          <Button onClick={() => navigate('/parent/payments')} variant="secondary">Renew term</Button>
        </div>
      )}

      {activeTerm && <TermCreditMeter term={activeTerm} />}

      <div className="booking-mode-toggle">
        <span className="booking-mode-label">How would you like to pay?</span>
        <div className="booking-mode-options">
          <button
            className={`booking-mode-btn ${bookingMode === 'term' ? 'active' : ''} ${!canBookRegularClass ? 'disabled' : ''}`}
            onClick={() => canBookRegularClass && setBookingMode('term')}
            disabled={!canBookRegularClass}
          >
            <Ticket size={16} />
            <div>
              <strong>Use a term credit</strong>
              <span>{canBookRegularClass ? `${classesRemaining} credit${classesRemaining !== 1 ? 's' : ''} remaining` : 'No credits available'}</span>
            </div>
            {bookingMode === 'term' && canBookRegularClass && <Check size={15} className="mode-check" />}
          </button>
          <button
            className={`booking-mode-btn ${bookingMode === 'individual' ? 'active' : ''} ${gatingState === 'NO_TERM_EVER' ? 'disabled' : ''}`}
            onClick={() => gatingState !== 'NO_TERM_EVER' && setBookingMode('individual')}
            disabled={gatingState === 'NO_TERM_EVER'}
          >
            <CreditCard size={16} />
            <div>
              <strong>Book individually</strong>
              <span>Pay per class · bank transfer</span>
            </div>
            {bookingMode === 'individual' && <Check size={15} className="mode-check" />}
          </button>
        </div>
      </div>

      {loadingSessions && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading classes…</p>}

      <div className="classes-list">
        {sessions.map(session => {
          const isBooked = bookedSessionId === session.id;
          const isFull = session.spaces_left === 0;
          const color = COLORS[session.subject] ?? 'yellow';
          const canBook = !isFull && (usingCredit ? canBookRegularClass : canBookIndividualClass);
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
              <div className="class-card-cost">
                {usingCredit
                  ? <span className="cost-badge credit">1 credit</span>
                  : <span className="cost-badge individual">Pay by bank transfer</span>
                }
              </div>
              {isBooked ? (
                <div className="booked-confirm"><Check size={16} /> Booked</div>
              ) : isFull ? (
                <Button variant="soft" onClick={() => { if (selectedChild) dataClient.joinWaitlist(selectedChild.id, session.id); }}>
                  <Users size={15} /> Join waiting list
                </Button>
              ) : canBook ? (
                <Button onClick={() => { setConfirming(session); setBookError(''); }} icon={Check}>
                  {usingCredit ? 'Book with credit' : 'Book individually'}
                </Button>
              ) : (
                <Button variant="soft" disabled>
                  {gatingState === 'NO_TERM_EVER' ? 'Purchase a term first' : 'Not available'}
                </Button>
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
            <p>Review the details below and confirm.</p>
            <div className="review-details">
              <div className="review-detail-row"><span>Child</span><b>{selectedChild?.name ?? '—'}</b></div>
              <div className="review-detail-row"><span>Subject</span><b>{confirming.subject}</b></div>
              <div className="review-detail-row"><span>Date</span><b>{new Date(confirming.starts_at).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}</b></div>
              <div className="review-detail-row"><span>Time</span><b>{new Date(confirming.starts_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}</b></div>
              <div className="review-detail-row"><span>Tutor</span><b>{confirming.teacher_name}</b></div>
              <div className="review-detail-row">
                <span>Cost</span>
                <b>{usingCredit ? '1 class credit (from your term)' : 'Pay by bank transfer'}</b>
              </div>
            </div>
            {bookError && <p className="auth-error">{bookError}</p>}
            <Button
              disabled={bookMutation.isPending}
              onClick={() => {
                if (usingCredit) {
                  bookMutation.mutate(confirming.id);
                } else {
                  navigate('/parent/payments', { state: { type: 'individual', childId: selectedChild?.id, sessionId: confirming.id } });
                }
              }}
              icon={usingCredit ? Check : ArrowRight}
            >
              {bookMutation.isPending ? 'Booking…' : usingCredit ? 'Confirm booking' : 'Proceed to payment'}
            </Button>
            <button className="modal-cancel" onClick={() => setConfirming(null)}>Not now</button>
          </div>
        </div>
      )}
    </div>
  );
}
