import { ArrowRight, Check, CircleDollarSign, CreditCard, Ticket, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { TermCreditMeter } from '../../../components/domain/TermCreditMeter';
import { useBookingEligibility } from '../hooks/useBookingEligibility';
import { useAuth } from '../../../app/providers';
import { dataClient } from '../../../lib/data/client';
import { INDIVIDUAL_CLASS_PRICE } from '../../../lib/config';

const classes = [
  { id: 'ci1', s: 'MATHEMATICS', day: 'Monday', time: '3:30 PM – 4:30 PM', tutor: 'Jessica Taylor', spaces: '4 spaces available', c: 'pink' },
  { id: 'ci2', s: 'ENGLISH', day: 'Wednesday', time: '4:30 PM – 5:30 PM', tutor: 'Sarah Wilson', spaces: '2 spaces available', c: 'teal' },
  { id: 'ci3', s: 'READING', day: 'Thursday', time: '4:00 PM – 5:00 PM', tutor: 'Daniel Smith', spaces: 'FULL', c: 'orange' },
];

export function BookClassPage() {
  const navigate = useNavigate();
  const { familyId } = useAuth();
  const {
    gatingState,
    canBookRegularClass,
    canBookIndividualClass,
    classesRemaining,
    activeTerm,
    isLoading,
  } = useBookingEligibility(familyId);

  const { data: children = [] } = useQuery({
    queryKey: ['children', familyId],
    queryFn: () => dataClient.getChildren(familyId),
  });

  const enrolledChildren = children.filter(c => c.enrolled);

  const [selectedChildIdx, setSelectedChildIdx] = useState(0);
  const selectedChild = enrolledChildren[selectedChildIdx];

  // 'term' = use a credit, 'individual' = pay per class
  const [bookingMode, setBookingMode] = useState<'term' | 'individual'>('term');

  const [bookedClass, setBookedClass] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<typeof classes[0] | null>(null);

  if (isLoading) return <div className="page-stack"><p>Loading...</p></div>;

  const childFirstName = selectedChild?.name.split(' ')[0] ?? 'your child';

  // Effective booking mode — if no active term credits, force individual
  const effectiveMode = (bookingMode === 'term' && canBookRegularClass) ? 'term' : 'individual';
  const usingCredit = effectiveMode === 'term';

  // ── No enrolled children at all ──────────────────────────────────────────
  if (enrolledChildren.length === 0) {
    return (
      <div className="page-stack">
        <div className="page-toolbar">
          <div><h2>Book a class</h2><p>Choose a session for your child this week.</p></div>
        </div>
        <div className="enrol-gate-banner">
          <div className="enrol-gate-icon">🎒</div>
          <div>
            <strong>No enrolled children yet</strong>
            <span>
              Complete the enrolment form for your child before booking a class.
              {children.length > 0
                ? ` You have ${children.length} child${children.length > 1 ? 'ren' : ''} added but none enrolled yet.`
                : ' Add and enrol a child to get started.'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {children.length === 0 && (
              <Button variant="secondary" onClick={() => navigate('/parent/children')} icon={ArrowRight}>Add a child</Button>
            )}
            <Button onClick={() => navigate('/parent/enrol')} icon={ArrowRight}>Enrol now</Button>
          </div>
        </div>
        {/* Still show classes so parent can browse what's available */}
        <div className="classes-list">
          {classes.map(x => (
            <div className={`class-card ${x.c}`} key={x.s}>
              <div className="class-card-top">
                <span className="class-subject">{x.s}</span>
                <span className={`space-badge ${x.spaces === 'FULL' ? 'full-badge' : ''}`}>{x.spaces}</span>
              </div>
              <div className="class-card-when"><h3>{x.day}</h3><span>{x.time}</span></div>
              <div className="class-tutor">
                <div className={`mini-avatar ${x.c}-bg`}>{x.tutor.split(' ').map(y => y[0]).join('')}</div>
                <span>with <b>{x.tutor}</b></span>
              </div>
              <Button variant="soft" disabled>Enrol to book</Button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">

      {/* Child switcher — enrolled children only */}
      <div className="child-switcher">
        {enrolledChildren.map((c, i) => (
          <button key={c.id} className={selectedChildIdx === i ? 'active' : ''} onClick={() => { setSelectedChildIdx(i); setBookedClass(null); }}>
            <span className="switcher-avatar">{c.initials}</span>
            <span className="switcher-name">{c.name.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      <div className="page-toolbar">
        <div><h2>Book a class</h2><p>Choose a session for {childFirstName} this week.</p></div>
        {activeTerm && (
          <div className="booking-count">
            <span>{classesRemaining} of {activeTerm.classes_included}</span> credits remaining
          </div>
        )}
      </div>

      {/* ── Gating banners ── */}
      {gatingState === 'NO_TERM_EVER' && (
        <div className="unlock-banner">
          <CircleDollarSign size={20} />
          <div>
            <strong>Purchase a term to use class credits</strong>
            <span>You can still book individual classes below at ${INDIVIDUAL_CLASS_PRICE} each.</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Button onClick={() => navigate('/parent/payments')} variant="secondary">Purchase term</Button>
          </div>
        </div>
      )}

      {gatingState === 'TERM_EXPIRED' && (
        <div className="unlock-banner">
          <CircleDollarSign size={20} />
          <div>
            <strong>Your term has expired</strong>
            <span>Renew your term to use credits again, or book individual classes below at ${INDIVIDUAL_CLASS_PRICE} each.</span>
          </div>
          <Button onClick={() => navigate('/parent/payments')} variant="secondary">Renew term</Button>
        </div>
      )}

      {gatingState === 'ACTIVE_TERM' && classesRemaining === 0 && (
        <div className="unlock-banner">
          <CircleDollarSign size={20} />
          <div>
            <strong>All {activeTerm?.classes_included} credits used</strong>
            <span>Book individual classes below at ${INDIVIDUAL_CLASS_PRICE} each, or renew your term early.</span>
          </div>
          <Button onClick={() => navigate('/parent/payments')} variant="secondary">Renew term</Button>
        </div>
      )}

      {activeTerm && <TermCreditMeter term={activeTerm} />}

      {/* ── Booking mode toggle ── */}
      <div className="booking-mode-toggle">
        <span className="booking-mode-label">How would you like to pay?</span>
        <div className="booking-mode-options">
          <button
            className={`booking-mode-btn ${bookingMode === 'term' ? 'active' : ''} ${!canBookRegularClass ? 'disabled' : ''}`}
            onClick={() => canBookRegularClass && setBookingMode('term')}
            title={!canBookRegularClass ? 'No active term credits available' : ''}
          >
            <Ticket size={16} />
            <div>
              <strong>Use a term credit</strong>
              <span>{canBookRegularClass ? `${classesRemaining} credit${classesRemaining !== 1 ? 's' : ''} remaining` : 'No credits available'}</span>
            </div>
            {bookingMode === 'term' && canBookRegularClass && <Check size={15} className="mode-check" />}
          </button>
          <button
            className={`booking-mode-btn ${bookingMode === 'individual' ? 'active' : ''} ${!canBookIndividualClass && gatingState === 'NO_TERM_EVER' ? 'disabled' : ''}`}
            onClick={() => setBookingMode('individual')}
          >
            <CreditCard size={16} />
            <div>
              <strong>Book individually</strong>
              <span>${INDIVIDUAL_CLASS_PRICE} per class · pay separately</span>
            </div>
            {bookingMode === 'individual' && <Check size={15} className="mode-check" />}
          </button>
        </div>
      </div>

      {/* ── Class list ── */}
      <div className="classes-list">
        {classes.map(x => {
          const isBooked = bookedClass === x.s;
          const isFull = x.spaces === 'FULL';
          const blocked = gatingState === 'NO_TERM_EVER' && bookingMode === 'individual';
          const canBook = !isFull && !blocked && (usingCredit ? canBookRegularClass : canBookIndividualClass);

          return (
            <div className={`class-card ${x.c} ${isBooked ? 'booked' : ''}`} key={x.s}>
              <div className="class-card-top">
                <span className="class-subject">{x.s}</span>
                <span className={`space-badge ${isFull ? 'full-badge' : ''}`}>{x.spaces}</span>
              </div>
              <div className="class-card-when"><h3>{x.day}</h3><span>{x.time}</span></div>
              <div className="class-tutor">
                <div className={`mini-avatar ${x.c}-bg`}>{x.tutor.split(' ').map(y => y[0]).join('')}</div>
                <span>with <b>{x.tutor}</b></span>
              </div>
              <div className="class-card-cost">
                {usingCredit
                  ? <span className="cost-badge credit">1 credit</span>
                  : <span className="cost-badge individual">${INDIVIDUAL_CLASS_PRICE}</span>
                }
              </div>

              {isBooked ? (
                <div className="booked-confirm"><Check size={16} /> Booked</div>
              ) : isFull ? (
                <Button variant="soft" disabled>Class full</Button>
              ) : canBook ? (
                <Button onClick={() => setConfirming(x)} icon={Check}>
                  {usingCredit ? 'Book with credit' : `Book for $${INDIVIDUAL_CLASS_PRICE}`}
                </Button>
              ) : (
                <Button variant="soft" disabled>
                  {gatingState === 'NO_TERM_EVER' ? 'Purchase a term first' : 'Not available'}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Confirm modal ── */}
      {confirming && (
        <div className="modal-backdrop" onClick={() => setConfirming(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setConfirming(null)}><X size={18} /></button>
            <div className="modal-icon"><Check size={22} /></div>
            <h2>Confirm booking</h2>
            <p>Review the details below and confirm.</p>
            <div className="review-details">
              <div className="review-detail-row"><span>Child</span><b>{selectedChild?.name ?? '—'}</b></div>
              <div className="review-detail-row"><span>Subject</span><b>{confirming.s}</b></div>
              <div className="review-detail-row"><span>Day</span><b>{confirming.day}</b></div>
              <div className="review-detail-row"><span>Time</span><b>{confirming.time}</b></div>
              <div className="review-detail-row"><span>Tutor</span><b>{confirming.tutor}</b></div>
              <div className="review-detail-row">
                <span>Cost</span>
                <b>{usingCredit ? '1 class credit (from your term)' : `$${INDIVIDUAL_CLASS_PRICE} — individual class`}</b>
              </div>
            </div>
            <Button
              onClick={() => {
                if (usingCredit) {
                  setBookedClass(confirming.s);
                  setConfirming(null);
                } else {
                  // Redirect to payments with class details as state
                  navigate('/parent/payments', {
                    state: {
                      type: 'individual',
                      classDetails: {
                        subject: confirming.s,
                        day: confirming.day,
                        time: confirming.time,
                        tutor: confirming.tutor,
                        child: selectedChild?.name ?? '—',
                        amount: INDIVIDUAL_CLASS_PRICE,
                      },
                    },
                  });
                }
              }}
              icon={usingCredit ? Check : ArrowRight}
            >
              {usingCredit ? 'Confirm booking' : 'Proceed to payment'}
            </Button>
            <button className="modal-cancel" onClick={() => setConfirming(null)}>Not now</button>
          </div>
        </div>
      )}

    </div>
  );
}
