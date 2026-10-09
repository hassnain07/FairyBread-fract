import { CalendarOff, Check, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { dataClient } from '../../../lib/data/client';
import { qk } from '../../../lib/data/queryKeys';
import { toAppError } from '../../../lib/data/errors';
import { formatMoney } from '../../../lib/utils/money';
import type { ClassSlot, ClassSlotInput } from '../../../types/teacher';
import type { Closure } from '../../../types/admin';

const DAYS_ISO: Record<number, string> = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 7: 'Sunday' };
const DAY_OPTIONS = [1, 2, 3, 4, 5, 6];

type SlotForm = {
  program_id: string;
  teacher_id: string;
  day_of_week: string;
  start_time: string;
  duration_minutes: string;
  capacity: string;
  price_cents: string;
};

const EMPTY_SLOT: SlotForm = {
  program_id: '',
  teacher_id: '',
  day_of_week: '1',
  start_time: '15:30',
  duration_minutes: '60',
  capacity: '15',
  price_cents: '5000',
};

export function AdminTimetablePage() {
  const qc = useQueryClient();

  // ── Slot state ──────────────────────────────────────────────────────────────
  const [showSlotForm, setShowSlotForm] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [slotForm, setSlotForm] = useState<SlotForm>(EMPTY_SLOT);
  const [slotError, setSlotError] = useState('');
  const [deactivateId, setDeactivateId] = useState<string | null>(null);
  const [cancelFuture, setCancelFuture] = useState(false);
  const [deactivateError, setDeactivateError] = useState('');

  // ── Session cancel state ────────────────────────────────────────────────────
  const [cancelSessionId, setCancelSessionId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSessionError, setCancelSessionError] = useState('');

  // ── Closure state ───────────────────────────────────────────────────────────
  const [showClosureForm, setShowClosureForm] = useState(false);
  const [closureForm, setClosureForm] = useState({ date: '', label: '' });
  const [closureError, setClosureError] = useState('');

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: slots = [], isLoading: slotsLoading } = useQuery({
    queryKey: qk.classSlots,
    queryFn: () => dataClient.getClassSlots(),
  });

  const { data: teachers = [] } = useQuery({
    queryKey: qk.teachers,
    queryFn: () => dataClient.getTeachers(),
  });

  const { data: programs = [] } = useQuery({
    queryKey: qk.programs,
    queryFn: () => dataClient.getPrograms(),
  });

  const { data: closures = [] } = useQuery({
    queryKey: ['closures'],
    queryFn: () => dataClient.getClosures(),
  });

  const today = new Date().toISOString();
  const weekEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: sessions = [] } = useQuery({
    queryKey: qk.sessions({ from: today, to: weekEnd }),
    queryFn: () => dataClient.getUpcomingSessions({ from: today, to: weekEnd }),
  });

  // ── Slot mutations ──────────────────────────────────────────────────────────
  const { mutate: createSlot, isPending: creating } = useMutation({
    mutationFn: (f: SlotForm) => dataClient.createClassSlot({
      program_id: f.program_id,
      teacher_id: f.teacher_id,
      day_of_week: Number(f.day_of_week),
      start_time: f.start_time,
      duration_minutes: Number(f.duration_minutes),
      capacity: Number(f.capacity),
      price_cents: Number(f.price_cents),
    } as ClassSlotInput),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.classSlots });
      qc.invalidateQueries({ queryKey: qk.sessions() });
      closeSlotForm();
    },
    onError: (e: Error) => setSlotError(toAppError(e).message),
  });

  const { mutate: updateSlot, isPending: updating } = useMutation({
    mutationFn: ({ id, f }: { id: string; f: SlotForm }) => dataClient.updateClassSlot(id, {
      program_id: f.program_id,
      teacher_id: f.teacher_id,
      day_of_week: Number(f.day_of_week),
      start_time: f.start_time,
      duration_minutes: Number(f.duration_minutes),
      capacity: Number(f.capacity),
      price_cents: Number(f.price_cents),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.classSlots });
      qc.invalidateQueries({ queryKey: qk.sessions() });
      closeSlotForm();
    },
    onError: (e: Error) => setSlotError(toAppError(e).message),
  });

  const { mutate: deactivateSlot, isPending: deactivating } = useMutation({
    mutationFn: ({ id, cf }: { id: string; cf: boolean }) => dataClient.deactivateClassSlot(id, cf),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.classSlots });
      qc.invalidateQueries({ queryKey: qk.sessions() });
      qc.invalidateQueries({ queryKey: qk.allBookings });
      setDeactivateId(null);
      setDeactivateError('');
    },
    onError: (e: Error) => setDeactivateError(toAppError(e).message),
  });

  const { mutate: cancelSession, isPending: cancellingSession } = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => dataClient.cancelSession(id, reason || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.sessions() });
      qc.invalidateQueries({ queryKey: qk.allBookings });
      setCancelSessionId(null);
      setCancelReason('');
      setCancelSessionError('');
    },
    onError: (e: Error) => setCancelSessionError(toAppError(e).message),
  });

  // ── Closure mutations ───────────────────────────────────────────────────────
  const { mutate: upsertClosure, isPending: savingClosure } = useMutation({
    mutationFn: (c: { date: string; label: string }) => dataClient.upsertClosure(c),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['closures'] });
      setShowClosureForm(false);
      setClosureForm({ date: '', label: '' });
      setClosureError('');
    },
    onError: (e: Error) => setClosureError(toAppError(e).message),
  });

  const { mutate: deleteClosure } = useMutation({
    mutationFn: (id: string) => dataClient.deleteClosure(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['closures'] }),
  });

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function openAddSlot() {
    setEditingSlotId(null);
    setSlotForm({ ...EMPTY_SLOT, program_id: programs[0]?.id ?? '', teacher_id: teachers[0]?.id ?? '' });
    setSlotError('');
    setShowSlotForm(true);
  }

  function openEditSlot(slot: ClassSlot) {
    setEditingSlotId(slot.id);
    setSlotForm({
      program_id: slot.program_id,
      teacher_id: slot.teacher_id,
      day_of_week: String(slot.day_of_week),
      start_time: slot.start_time,
      duration_minutes: String(slot.duration_minutes),
      capacity: String(slot.capacity),
      price_cents: String(slot.price_cents ?? 5000),
    });
    setSlotError('');
    setShowSlotForm(true);
  }

  function closeSlotForm() {
    setShowSlotForm(false);
    setEditingSlotId(null);
    setSlotError('');
  }

  function handleSlotSubmit() {
    if (!slotForm.program_id) { setSlotError('Please select a program.'); return; }
    if (!slotForm.teacher_id) { setSlotError('Please select a teacher.'); return; }
    if (!slotForm.start_time) { setSlotError('Start time is required.'); return; }
    const cap = Number(slotForm.capacity);
    if (!cap || cap < 1) { setSlotError('Capacity must be at least 1.'); return; }
    setSlotError('');
    if (editingSlotId) {
      updateSlot({ id: editingSlotId, f: slotForm });
    } else {
      createSlot(slotForm);
    }
  }

  // Group slots by day
  const activeDays = DAY_OPTIONS.filter(d => slots.some(s => s.day_of_week === d));
  const teacherMap = Object.fromEntries(teachers.map(t => [t.id, t]));
  const programMap = Object.fromEntries(programs.map(p => [p.id, p]));

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div><h2>Timetable</h2><p>Manage the term class schedule.</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="soft" icon={CalendarOff} onClick={() => setShowClosureForm(true)}>Add closure</Button>
          <Button icon={Plus} onClick={openAddSlot}>Add class</Button>
        </div>
      </div>

      {/* ── Timetable grid ── */}
      <div className="card timetable-card">
        {slotsLoading && <p style={{ padding: 24, color: 'var(--muted)' }}>Loading…</p>}
        {!slotsLoading && slots.length === 0 && (
          <div className="timetable-empty">
            <p>No classes added yet. Click <strong>Add class</strong> to build the timetable.</p>
          </div>
        )}
        {!slotsLoading && slots.length > 0 && (
          <div className="timetable-scroll">
            <table className="timetable-table">
              <thead>
                <tr>
                  <th className="timetable-time-col">Time</th>
                  {activeDays.map(d => <th key={d}>{DAYS_ISO[d]}</th>)}
                </tr>
              </thead>
              <tbody>
                {[...new Set(slots.map(s => s.start_time))].sort().map(time => (
                  <tr key={time}>
                    <td className="timetable-time-cell">{time}</td>
                    {activeDays.map(day => {
                      const cell = slots.filter(s => s.day_of_week === day && s.start_time === time);
                      return (
                        <td key={day} className="timetable-cell">
                          {cell.map(slot => {
                            const teacher = teacherMap[slot.teacher_id];
                            const program = programMap[slot.program_id];
                            const color = program?.color ?? 'pink';
                            const nextSession = sessions.find(s => s.class_id === slot.id);
                            return (
                              <div key={slot.id} className={`timetable-chip ${color}`}>
                                <div className="timetable-chip-subject">{slot.subject}</div>
                                {teacher && (
                                  <div className="timetable-chip-teacher">
                                    <span className={`mini-avatar ${teacher.color}-bg`} style={{ width: 16, height: 16, fontSize: 8 }}>{teacher.initials}</span>
                                    {teacher.name}
                                  </div>
                                )}
                                <div className="timetable-chip-meta">
                                  {slot.next_booked_count}/{slot.capacity} booked
                                  {slot.price_cents !== undefined && ` · ${formatMoney(slot.price_cents)}`}
                                </div>
                                <div className="timetable-chip-actions">
                                  <button onClick={() => openEditSlot(slot)} title="Edit">✏</button>
                                  {nextSession && (
                                    <button onClick={() => { setCancelSessionId(nextSession.id); setCancelReason(''); setCancelSessionError(''); }} title="Cancel next session">
                                      <CalendarOff size={11} />
                                    </button>
                                  )}
                                  <button onClick={() => { setDeactivateId(slot.id); setCancelFuture(false); setDeactivateError(''); }} title="Deactivate">
                                    <Trash2 size={11} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Closures ── */}
      {closures.length > 0 && (
        <div className="card" style={{ padding: '16px 20px' }}>
          <div className="card-heading"><div><span className="label">Closures</span><h3>Public holidays &amp; centre closures</h3></div></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {[...closures].sort((a, b) => a.date.localeCompare(b.date)).map((c: Closure) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{new Date(c.date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>{c.label}</span>
                <button className="btn-view-profile" style={{ marginLeft: 'auto' }} onClick={() => deleteClosure(c.id)}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Add/Edit slot modal ── */}
      {showSlotForm && (
        <div className="modal-backdrop" onClick={closeSlotForm}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <button className="modal-close" onClick={closeSlotForm}><X size={18} /></button>
            <div className="modal-icon"><Plus size={22} /></div>
            <h2>{editingSlotId ? 'Edit class' : 'Add a class'}</h2>
            <p>Fill in the details for this timetable slot.</p>
            <div className="form-grid" style={{ marginTop: 20 }}>
              <label style={{ gridColumn: '1 / -1' }}>
                Program
                <select value={slotForm.program_id} onChange={e => setSlotForm({ ...slotForm, program_id: e.target.value })}>
                  <option value="">— Select a program —</option>
                  {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                Teacher
                <select value={slotForm.teacher_id} onChange={e => setSlotForm({ ...slotForm, teacher_id: e.target.value })}>
                  <option value="">— Select a teacher —</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label>
                Day
                <select value={slotForm.day_of_week} onChange={e => setSlotForm({ ...slotForm, day_of_week: e.target.value })}>
                  {DAY_OPTIONS.map(d => <option key={d} value={d}>{DAYS_ISO[d]}</option>)}
                </select>
              </label>
              <label>
                Start time (24h)
                <input value={slotForm.start_time} onChange={e => setSlotForm({ ...slotForm, start_time: e.target.value })} placeholder="e.g. 15:30" />
              </label>
              <label>
                Duration (minutes)
                <input type="number" min={15} value={slotForm.duration_minutes} onChange={e => setSlotForm({ ...slotForm, duration_minutes: e.target.value })} />
              </label>
              <label>
                Capacity
                <input type="number" min={1} value={slotForm.capacity} onChange={e => setSlotForm({ ...slotForm, capacity: e.target.value })} />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                Price (cents, e.g. 5000 = $50.00)
                <input type="number" min={0} value={slotForm.price_cents} onChange={e => setSlotForm({ ...slotForm, price_cents: e.target.value })} />
              </label>
            </div>
            {slotError && <div className="auth-error" style={{ marginTop: 12 }}>{slotError}</div>}
            <Button onClick={handleSlotSubmit} disabled={creating || updating} icon={Check} style={{ marginTop: 20 }}>
              {creating || updating ? 'Saving…' : editingSlotId ? 'Save changes' : 'Add class'}
            </Button>
            <button className="modal-cancel" onClick={closeSlotForm}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Deactivate confirm modal ── */}
      {deactivateId && (
        <div className="modal-backdrop" onClick={() => setDeactivateId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setDeactivateId(null)}><X size={18} /></button>
            <h2>Deactivate this class?</h2>
            <p>No new sessions will be generated. Existing bookings are not automatically cancelled unless you choose the option below.</p>
            <div style={{ margin: '16px 0' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={cancelFuture} onChange={e => setCancelFuture(e.target.checked)} />
                Cancel all upcoming sessions and return credits to families
              </label>
            </div>
            {deactivateError && <div className="auth-error">{deactivateError}</div>}
            <Button onClick={() => deactivateSlot({ id: deactivateId, cf: cancelFuture })} disabled={deactivating}>
              {deactivating ? 'Deactivating…' : 'Yes, deactivate'}
            </Button>
            <button className="modal-cancel" onClick={() => setDeactivateId(null)}>Keep it</button>
          </div>
        </div>
      )}

      {/* ── Cancel session modal ── */}
      {cancelSessionId && (
        <div className="modal-backdrop" onClick={() => setCancelSessionId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setCancelSessionId(null)}><X size={18} /></button>
            <h2>Cancel this session?</h2>
            <p>Credits will be returned to all booked families and they will be notified.</p>
            <label style={{ display: 'block', marginTop: 16 }}>
              Reason (optional)
              <input value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="e.g. Public holiday" style={{ marginTop: 6 }} />
            </label>
            {cancelSessionError && <div className="auth-error" style={{ marginTop: 8 }}>{cancelSessionError}</div>}
            <Button onClick={() => cancelSession({ id: cancelSessionId, reason: cancelReason })} disabled={cancellingSession} style={{ marginTop: 16 }}>
              {cancellingSession ? 'Cancelling…' : 'Yes, cancel session'}
            </Button>
            <button className="modal-cancel" onClick={() => setCancelSessionId(null)}>Keep it</button>
          </div>
        </div>
      )}

      {/* ── Add closure modal ── */}
      {showClosureForm && (
        <div className="modal-backdrop" onClick={() => setShowClosureForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowClosureForm(false)}><X size={18} /></button>
            <div className="modal-icon"><CalendarOff size={22} /></div>
            <h2>Add closure</h2>
            <p>Sessions on this date will not be generated.</p>
            <div className="form-grid" style={{ marginTop: 16 }}>
              <label>
                Date
                <input type="date" value={closureForm.date} onChange={e => setClosureForm({ ...closureForm, date: e.target.value })} />
              </label>
              <label>
                Label
                <input value={closureForm.label} onChange={e => setClosureForm({ ...closureForm, label: e.target.value })} placeholder="e.g. Public holiday" />
              </label>
            </div>
            {closureError && <div className="auth-error" style={{ marginTop: 8 }}>{closureError}</div>}
            <Button
              onClick={() => {
                if (!closureForm.date || !closureForm.label.trim()) { setClosureError('Date and label are required.'); return; }
                upsertClosure(closureForm);
              }}
              disabled={savingClosure}
              icon={Check}
              style={{ marginTop: 16 }}
            >
              {savingClosure ? 'Saving…' : 'Save closure'}
            </Button>
            <button className="modal-cancel" onClick={() => setShowClosureForm(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
