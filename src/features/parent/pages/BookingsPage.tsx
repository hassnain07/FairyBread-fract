import { Check, ChevronRight, Clock3, Plus, UserRound, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { TermCreditMeter } from '../../../components/domain/TermCreditMeter';
import { useBookingEligibility } from '../hooks/useBookingEligibility';
import { useAuth } from '../../../app/providers';
import { dataClient } from '../../../lib/data/client';

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const COLORS: Record<string, string> = { Mathematics: 'pink', English: 'teal', Reading: 'orange', 'Reading & Spelling': 'orange' };

export function BookingsPage() {
  const navigate = useNavigate();
  const { familyId } = useAuth();
  const qc = useQueryClient();
  const { activeTerm } = useBookingEligibility(familyId);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const { data: bookings = [], isLoading: loadingBookings } = useQuery({
    queryKey: ['bookings', familyId],
    queryFn: () => dataClient.getBookings(familyId),
  });

  const { data: classInstances = [] } = useQuery({
    queryKey: ['classInstances'],
    queryFn: () => dataClient.getClassInstances(),
  });

  const { data: children = [] } = useQuery({
    queryKey: ['children', familyId],
    queryFn: () => dataClient.getChildren(familyId),
  });

  const { mutate: cancelBooking, isPending: cancelling } = useMutation({
    mutationFn: (id: string) => dataClient.cancelBooking(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings', familyId] });
      qc.invalidateQueries({ queryKey: ['terms', familyId] });
      setCancellingId(null);
    },
  });

  const activeBookings = bookings.filter(b => b.status !== 'cancelled');

  // Enrich each booking with class + child info
  const enriched = activeBookings.map(b => {
    const cls = classInstances.find(c => c.id === b.class_instance_id);
    const child = children.find(c => c.id === b.child_id);
    const color = cls ? (COLORS[cls.subject] ?? 'yellow') : 'yellow';
    return { booking: b, cls, child, color };
  });

  // Fake a date for display (real dates would come from a scheduled class_date field)
  const today = new Date();
  const getDisplayDate = (index: number) => {
    const d = new Date(today);
    d.setDate(today.getDate() + index * 2 + 1);
    return d;
  };

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div><h2>Your week, sorted</h2><p>One less thing to keep in your head.</p></div>
        <Button icon={Plus} onClick={() => navigate('/parent/book-class')}>Book another class</Button>
      </div>

      {activeTerm && <TermCreditMeter term={activeTerm} />}

      <div className="booking-cards">
        {loadingBookings && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading bookings…</p>}

        {!loadingBookings && enriched.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '32px 24px' }}>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>No upcoming bookings yet.</p>
            <Button onClick={() => navigate('/parent/book-class')} icon={Plus}>Book a class</Button>
          </div>
        )}

        {enriched.map(({ booking, cls, child, color }, i) => {
          const d = getDisplayDate(i);
          return (
            <div className={`card booking-card ${color}`} key={booking.id}>
              <div className="booking-date">
                <span>{DAYS[d.getDay()]}</span>
                <strong>{d.getDate()}</strong>
                <small>{MONTHS[d.getMonth()]}</small>
              </div>
              <div className="booking-main">
                <span className="label">{cls?.subject ?? '—'}</span>
                <h3>{cls ? `${cls.subject} with ${cls.teacher_id}` : 'Class'}</h3>
                <p><Clock3 size={15} />{cls?.time ?? '—'}</p>
                <p><UserRound size={15} />{child?.name ?? '—'}</p>
              </div>
              <div className="booking-right">
                <span className={`status ${booking.status === 'confirmed' ? 'confirmed' : 'pending'}`}>
                  <Check size={13} />{booking.status === 'confirmed' ? 'Confirmed' : booking.status}
                </span>
                <button onClick={() => setCancellingId(booking.id)}>
                  Cancel booking <ChevronRight size={15} />
                </button>
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

      {/* Cancel confirmation modal */}
      {cancellingId && (
        <div className="modal-backdrop" onClick={() => setCancellingId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setCancellingId(null)}><X size={18} /></button>
            <div className="modal-icon cancel"><Clock3 size={22} /></div>
            <h2>Cancel booking?</h2>
            <p>This will cancel the booking and restore your class credit if cancelled within the allowed window.</p>
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
