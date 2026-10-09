import { Check, MoreHorizontal, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { Progress } from '../../../components/ui/Progress';
import { dataClient } from '../../../lib/data/client';
import { useAuth } from '../../../app/providers';
import { qk } from '../../../lib/data/queryKeys';
import { toAppError } from '../../../lib/data/errors';
import { formatMoney } from '../../../lib/utils/money';

// TODO: confirm with client — teacher-set price is internal/admin-facing only.
// Does not affect what parents pay during term-credit booking (always 1 credit).

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
type FormState = { subject: string; day: string; time: string; capacity: string; price: string };
const BLANK: FormState = { subject: '', day: 'Monday', time: '', capacity: '15', price: '5000' };

export function TeacherClassesPage() {
  const qc = useQueryClient();
  const { teacherId } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(BLANK);
  const [error, setError] = useState('');

  const { data: slots = [], isLoading } = useQuery({
    queryKey: qk.classSlots,
    queryFn: () => dataClient.getClassSlots(),
    enabled: !!teacherId,
  });

  const { data: programs = [] } = useQuery({
    queryKey: qk.programs,
    queryFn: () => dataClient.getPrograms(),
  });

  const mySlots = slots.filter(s => s.teacher_id === teacherId && s.is_active);

  const save = useMutation({
    mutationFn: async () => {
      const cap = parseInt(form.capacity);
      const price = parseInt(form.price);
      if (!form.subject.trim() || !form.time.trim()) throw new Error('Subject and time are required.');
      if (isNaN(cap) || cap < 1) throw new Error('Capacity must be at least 1.');
      if (isNaN(price) || price < 0) throw new Error('Price must be 0 or more.');
      const input = {
        subject: form.subject.trim(),
        day_of_week: DAYS.indexOf(form.day) + 1,
        start_time: form.time.trim(),
        duration_minutes: 60,
        capacity: cap,
        price_cents: price,
        teacher_id: teacherId,
        program_id: programs[0]?.id ?? '',
        is_active: true,
      };
      return editId ? dataClient.updateClassSlot(editId, input) : dataClient.createClassSlot(input);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.classSlots });
      qc.invalidateQueries({ queryKey: ['sessions'] });
      setShowAdd(false); setEditId(null); setForm(BLANK); setError('');
    },
    onError: (e) => setError(toAppError(e).message),
  });

  const openEdit = (id: string) => {
    const s = mySlots.find(sl => sl.id === id);
    if (!s) return;
    setForm({ subject: s.subject, day: DAYS[s.day_of_week - 1] ?? 'Monday', time: s.start_time, capacity: String(s.capacity), price: String(s.price_cents ?? 5000) });
    setEditId(id); setShowAdd(true);
  };

  if (isLoading) return <div className="page-stack"><p>Loading…</p></div>;

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div><h2>My classes</h2><p>Your timetable and pricing.</p></div>
        <Button icon={Plus} onClick={() => { setEditId(null); setForm(BLANK); setError(''); setShowAdd(true); }}>Add class</Button>
      </div>

      {mySlots.length === 0 && <div className="card" style={{ padding: 20 }}><p className="empty-state-text">No classes yet.</p></div>}

      <div className="admin-class-grid">
        {mySlots.map(s => (
          <div className={`card admin-class ${s.teacher_color ?? 'pink'}`} key={s.id}>
            <div className="class-card-top">
              <span className="class-subject">{s.subject}</span>
              <button onClick={() => openEdit(s.id)}><MoreHorizontal size={18} /></button>
            </div>
            <h3>{DAYS[s.day_of_week - 1] ?? '—'}</h3>
            <strong>{s.start_time}</strong>
            <div className="capacity">
              <span>Enrolled</span><b>{s.next_booked_count} / {s.capacity}</b>
              <Progress value={(s.next_booked_count / s.capacity) * 100} color={s.teacher_color ?? 'pink'} />
            </div>
            {s.price_cents !== undefined && (
              <div className="review-detail-row"><span>Class price</span><b>{formatMoney(s.price_cents)}</b></div>
            )}
          </div>
        ))}
      </div>

      {showAdd && (
        <div className="modal-backdrop" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowAdd(false)}><X size={18} /></button>
            <h2>{editId ? 'Edit class' : 'Add class'}</h2>
            {error && <p className="auth-error">{error}</p>}
            <div className="add-modal-form">
              <label>Subject<input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Mathematics" /></label>
              <label>Day
                <select value={form.day} onChange={e => setForm({ ...form, day: e.target.value })}>
                  {DAYS.map(d => <option key={d}>{d}</option>)}
                </select>
              </label>
              <label>Time (24h)<input value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} placeholder="e.g. 15:30" /></label>
              <label>Max capacity<input value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} placeholder="15" /></label>
              <label>
                Class price (cents)
                <input value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="5000" />
                <small style={{ color: 'var(--muted)', fontSize: 11 }}>Internal use only — does not affect term-credit booking cost.</small>
              </label>
            </div>
            <div className="review-actions">
              <Button variant="ghost" onClick={() => setShowAdd(false)} icon={X}>Cancel</Button>
              <Button onClick={() => save.mutate()} icon={Check} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
