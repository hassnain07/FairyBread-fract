import { Download, X } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { Toggle } from '../../../components/ui/Toggle';
import { dataClient } from '../../../lib/data/client';
import { qk } from '../../../lib/data/queryKeys';
import { toAppError } from '../../../lib/data/errors';
import type { ClassBooking } from '../../../types/booking';

const FILTER_OPTIONS = ['All', 'Confirmed', 'Waiting list', 'Cancelled'] as const;
type Filter = typeof FILTER_OPTIONS[number];

function statusClass(s: ClassBooking['status']) {
  if (s === 'confirmed') return 'confirmed';
  if (s === 'cancelled') return 'failed';
  if (s === 'waiting_list') return 'pending';
  return 'view';
}

export function AdminBookingsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('All');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [restoreCredit, setRestoreCredit] = useState(true);
  const [cancelError, setCancelError] = useState('');

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: qk.allBookings,
    queryFn: () => dataClient.getAllBookings(),
  });

  const { mutate: cancelBooking, isPending: cancelling } = useMutation({
    mutationFn: (id: string) => dataClient.cancelBooking(id, { restoreCredit }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.allBookings });
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['terms'] });
      qc.invalidateQueries({ queryKey: qk.sessions() });
      setCancellingId(null);
      setCancelError('');
    },
    onError: (e: Error) => setCancelError(toAppError(e).message),
  });

  const filtered = bookings.filter(b => {
    if (filter === 'All') return true;
    if (filter === 'Confirmed') return b.status === 'confirmed';
    if (filter === 'Waiting list') return b.status === 'waiting_list';
    if (filter === 'Cancelled') return b.status === 'cancelled';
    return true;
  });

  const counts: Record<Filter, number> = {
    All: bookings.length,
    Confirmed: bookings.filter(b => b.status === 'confirmed').length,
    'Waiting list': bookings.filter(b => b.status === 'waiting_list').length,
    Cancelled: bookings.filter(b => b.status === 'cancelled').length,
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
              <tr>{['Student', 'Subject', 'Tutor', 'Date', 'Source', 'Status', ''].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Loading…</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No bookings found.</td></tr>
              )}
              {filtered.map(b => {
                const session = b.session;
                const child = b.child;
                const date = session?.starts_at
                  ? new Date(session.starts_at).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
                  : '—';
                return (
                  <tr key={b.id}>
                    <td><strong className="table-name">{child?.name ?? '—'}</strong></td>
                    <td>{session?.subject ?? '—'}</td>
                    <td>{session?.teacher_name ?? '—'}</td>
                    <td>{date}</td>
                    <td>
                      <span className={`table-status ${b.source === 'term_credit' ? 'confirmed' : 'view'}`}>
                        {b.source === 'term_credit' ? 'Term credit' : 'Individual'}
                      </span>
                    </td>
                    <td>
                      <span className={`table-status ${statusClass(b.status)}`}>
                        {b.status.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())}
                      </span>
                    </td>
                    <td>
                      {b.status === 'confirmed' && (
                        <button className="btn-view-profile" onClick={() => { setCancellingId(b.id); setRestoreCredit(true); setCancelError(''); }}>Cancel</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {cancellingId && (
        <div className="modal-backdrop" onClick={() => setCancellingId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setCancellingId(null)}><X size={18} /></button>
            <h2>Cancel booking?</h2>
            <p>Choose whether to return the family's class credit.</p>
            <div style={{ margin: '16px 0' }}>
              <Toggle on={restoreCredit} onToggle={() => setRestoreCredit(v => !v)} label="Return credit to family" sublabel={restoreCredit ? 'Credit will be restored' : 'Credit will not be restored'} />
            </div>
            {cancelError && <div className="auth-error">{cancelError}</div>}
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
