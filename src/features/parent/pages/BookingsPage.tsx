import { Check, ChevronRight, Clock3, Plus, UserRound, X } from 'lucide-react';
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

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const COLORS: Record<string, string> = { Mathematics: 'pink', English: 'teal', Reading: 'orange' };

export function BookingsPage() {
  const navigate = useNavigate();
  const { familyId } = useAuth();
  const qc = useQueryClient();
  const { activeTerm } = useBookingEligibility(familyId);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelResult, setCancelResult] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState('');

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: qk.bookings(familyId),
    queryFn: () => dataClient.getBookings(familyId),
    enabled: !!familyId,
  });

  const { mutate: cancelBooking, isPending: cancelling } = useMutation({
    mutationFn: (id: string) => dataClient.cancelBooking(id),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: qk.bookings(familyId) });
      qc.invalidateQueries({ queryKey: qk.terms(familyId) });
      qc.invalidateQueries({ queryKey: ['gating', familyId] });
      qc.invalidateQueries({ queryKey: qk.sessions() });
      setCancellingId(null);
      setCancelResult(result.credit_restored ? 'Booking cancelled — your credit has been returned.' : 'Booking cancelled.');
      setCancelError('');
    },
    onError: (e) => setCancelError(toAppError(e).message),
  });

  const activeBookings = bookings.filter(b => b.status !== 'cancelled');

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div><h2>Your week, sorted</h2><p>One less thing to keep in your head.</p></div>
        <Button icon={Plus} onClick={() => navigate('/parent/book-class')}>Book another class</Button>
      </div>

      {activeTerm && <TermCreditMeter term={activeTerm} />}

      {cancelResult && (
        <div className="unlock-banner" style={{ background: 'var(--success-bg, #f0fdf4)' }}>
          <Check size={18} /><span>{cancelResult}</span>
          <button onClick={() => setCancelResult(null)} style={{ marginLeft: 'auto' }}><X size={16} /></button>
        </div>
      )}

      <div className="booking-cards">
        {isLoading && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading bookings…</p>}

        {!isLoading && activeBookings.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '32px 24px' }}>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>No upcoming bookings yet.</p>
            <Button onClick={() => navigate('/parent/book-class')} icon={Plus}>Book a class</Button>
          </div>
        )}

        {activeBookings.map(booking => {
          const session = booking.session;
          const child = booking.child;
          const color = session ? (COLORS[session.subject] ?? 'yellow') : 'yellow';
          const d = session ? new Date(session.starts_at) : null;

          return (
            <div className={`card booking-card ${color}`} key={booking.id}>
              {d && (
                <div className="booking-date">
                  <span>{DAYS[d.getDay()]}</span>
                  <strong>{d.getDate()}</strong>
                  <small>{MONTHS[d.getMonth()]}</small>
                </div>
              )}
              <div className="booking-main">
                <span className="label">{session?.subject ?? '—'}</span>
                <h3>{session ? `${session.subject} with ${session.teacher_name}` : 'Class'}</h3>
                {d && <p><Clock3 size={15} />{d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}</p>}
                {child && <p><UserRound size={15} />{child.name}</p>}
              </div>
              <div className="booking-right">
                {booking.status === 'confirmed' && (
                  <span className="status confirmed"><Check size={13} />Confirmed</span>
                )}
                {booking.status === 'waiting_list' && (
                  <span className="status pending">On waiting list</span>
                )}
                {booking.status === 'pending_payment' && (
                  <span className="status pending">Awaiting payment</span>
                )}
                {booking.status === 'confirmed' && (
                  <button onClick={() => { setCancellingId(booking.id); setCancelError(''); }}>
                    Cancel booking <ChevronRight size={15} />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        <div className="card policy-card">
          <div className="policy-icon"><Clock3 size={19} /></div>
          <div>
            <span className="label">Cancellation policy</span>
            <p>Cancel 24+ hours before your session to restore your class credit.</p>
          </div>
        </div>
      </div>

      {cancellingId && (
        <div className="modal-backdrop" onClick={() => setCancellingId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setCancellingId(null)}><X size={18} /></button>
            <div className="modal-icon cancel"><Clock3 size={22} /></div>
            <h2>Cancel booking?</h2>
            <p>If you cancel more than 24 hours before the session, your class credit will be returned.</p>
            {cancelError && <p className="auth-error">{cancelError}</p>}
            <Button onClick={() => cancelBooking(cancellingId)} disabled={cancelling}>
              {cancelling ? 'Cancelling…' : 'Yes, cancel booking'}
            </Button>
            <button className="modal-cancel" onClick={() => setCancellingId(null)}>Keep booking</button>
          </div>
        </div>
      )}
    </div>
  );
}
