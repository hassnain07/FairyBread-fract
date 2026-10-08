import { Check, ChevronRight, Download, X } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { dataClient } from '../../../lib/data/client';

const ALL_FAMILY_IDS = ['f1', 'f2', 'f3', 'f4'];

const FILTER_OPTIONS = ['All', 'Confirmed', 'Cancelled'] as const;
type Filter = typeof FILTER_OPTIONS[number];

export function AdminBookingsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('All');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const { data: allBookings = [], isLoading } = useQuery({
    queryKey: ['allBookings'],
    queryFn: async () => (await Promise.all(ALL_FAMILY_IDS.map(id => dataClient.getBookings(id)))).flat(),
  });

  const { data: classInstances = [] } = useQuery({
    queryKey: ['classInstances'],
    queryFn: () => dataClient.getClassInstances(),
  });

  const { data: allChildren = [] } = useQuery({
    queryKey: ['allChildren'],
    queryFn: async () => (await Promise.all(ALL_FAMILY_IDS.map(id => dataClient.getChildren(id)))).flat(),
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ['teachers'],
    queryFn: () => dataClient.getTeachers(),
  });

  const { mutate: cancelBooking, isPending: cancelling } = useMutation({
    mutationFn: (id: string) => dataClient.cancelBooking(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['allBookings'] });
      setCancellingId(null);
    },
  });

  const enriched = allBookings.map(b => {
    const cls = classInstances.find(c => c.id === b.class_instance_id);
    const child = allChildren.find(c => c.id === b.child_id);
    const teacher = cls ? teachers.find(t => t.id === cls.teacher_id) : null;
    return { booking: b, cls, child, teacher };
  });

  const filtered = enriched.filter(({ booking }) => {
    if (filter === 'All') return true;
    if (filter === 'Confirmed') return booking.status === 'confirmed';
    if (filter === 'Cancelled') return booking.status === 'cancelled';
    return true;
  });

  const counts = {
    All: enriched.length,
    Confirmed: enriched.filter(e => e.booking.status === 'confirmed').length,
    Cancelled: enriched.filter(e => e.booking.status === 'cancelled').length,
  };

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div><h2>Bookings</h2><p>Manage every session with ease.</p></div>
        <Button variant="soft" icon={Download}>Export list</Button>
      </div>

      <div className="card table-card">
        <div className="table-filters">
          {FILTER_OPTIONS.map(f => (
            <button key={f} className={filter === f ? 'filter-active' : ''} onClick={() => setFilter(f)}>
              {f} <span>{counts[f]}</span>
            </button>
          ))}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>{['Student', 'Subject', 'Tutor', 'Day', 'Time', 'Source', 'Status', ''].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Loading…</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No bookings found.</td></tr>
              )}
              {filtered.map(({ booking, cls, child, teacher }) => (
                <tr key={booking.id}>
                  <td><strong className="table-name">{child?.name ?? '—'}</strong></td>
                  <td>{cls?.subject ?? '—'}</td>
                  <td>{teacher?.name ?? '—'}</td>
                  <td>{cls?.day_of_week ?? '—'}</td>
                  <td>{cls?.time ?? '—'}</td>
                  <td>
                    <span className={`table-status ${booking.source === 'term_credit' ? 'confirmed' : 'view'}`}>
                      {booking.source === 'term_credit' ? 'Term credit' : 'Individual'}
                    </span>
                  </td>
                  <td>
                    <span className={`table-status ${booking.status === 'confirmed' ? 'confirmed' : booking.status === 'cancelled' ? 'failed' : 'pending'}`}>
                      {booking.status.charAt(0).toUpperCase() + booking.status.slice(1).replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    {booking.status === 'confirmed' && (
                      <button className="btn-view-profile" onClick={() => setCancellingId(booking.id)}>Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {cancellingId && (
        <div className="modal-backdrop" onClick={() => setCancellingId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setCancellingId(null)}><X size={18} /></button>
            <h2>Cancel booking?</h2>
            <p>This will cancel the booking and restore the family's class credit if applicable.</p>
            <Button onClick={() => cancelBooking(cancellingId)} disabled={cancelling}>
              {cancelling ? 'Cancelling…' : 'Yes, cancel'}
            </Button>
            <button className="modal-cancel" onClick={() => setCancellingId(null)}>Keep booking</button>
          </div>
        </div>
      )}
    </div>
  );
}
