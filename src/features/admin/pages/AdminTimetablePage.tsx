import { Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { dataClient } from '../../../lib/data/client';
import { INDIVIDUAL_CLASS_PRICE } from '../../../lib/config';
import type { ClassInstance } from '../../../types/teacher';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SUBJECTS = ['Mathematics', 'English', 'Reading & Spelling', 'Maths & English'];

const SUBJECT_COLORS: Record<string, string> = {
  'Mathematics': 'pink',
  'English': 'teal',
  'Reading & Spelling': 'orange',
  'Maths & English': 'yellow',
};

function colorFor(subject: string) {
  return SUBJECT_COLORS[subject] ?? 'green';
}

type FormState = {
  subject: string;
  day_of_week: string;
  time: string;
  teacher_id: string;
  capacity: string;
};

const EMPTY_FORM: FormState = {
  subject: SUBJECTS[0],
  day_of_week: DAYS[0],
  time: '3:30 PM',
  teacher_id: '',
  capacity: '15',
};

export function AdminTimetablePage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');

  const { data: classes = [], isLoading } = useQuery({
    queryKey: ['classInstances'],
    queryFn: () => dataClient.getClassInstances(),
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ['teachers'],
    queryFn: () => dataClient.getTeachers(),
  });

  const { mutate: createClass, isPending: creating } = useMutation({
    mutationFn: (f: FormState) => dataClient.createClassInstance({
      subject: f.subject,
      day_of_week: f.day_of_week,
      time: f.time,
      teacher_id: f.teacher_id,
      capacity: Number(f.capacity),
      price: INDIVIDUAL_CLASS_PRICE,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['classInstances'] }); closeForm(); },
    onError: (e: Error) => setFormError(e.message),
  });

  const { mutate: updateClass, isPending: updating } = useMutation({
    mutationFn: ({ id, f }: { id: string; f: FormState }) => dataClient.updateClassInstance(id, {
      subject: f.subject,
      day_of_week: f.day_of_week,
      time: f.time,
      teacher_id: f.teacher_id,
      capacity: Number(f.capacity),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['classInstances'] }); closeForm(); },
    onError: (e: Error) => setFormError(e.message),
  });

  const { mutate: deleteClass, isPending: deleting } = useMutation({
    mutationFn: (id: string) => dataClient.deleteClassInstance(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['classInstances'] }); setDeleteId(null); },
  });

  function openAdd() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, teacher_id: teachers[0]?.id ?? '' });
    setFormError('');
    setShowForm(true);
  }

  function openEdit(cls: ClassInstance) {
    setEditingId(cls.id);
    setForm({
      subject: cls.subject,
      day_of_week: cls.day_of_week,
      time: cls.time,
      teacher_id: cls.teacher_id,
      capacity: String(cls.capacity),
    });
    setFormError('');
    setShowForm(true);
  }

  function closeForm() { setShowForm(false); setEditingId(null); setFormError(''); }

  function handleSubmit() {
    if (!form.subject.trim() || !form.time.trim()) { setFormError('Subject and time are required.'); return; }
    if (!form.teacher_id) { setFormError('Please select a teacher.'); return; }
    const cap = Number(form.capacity);
    if (!cap || cap < 1) { setFormError('Capacity must be at least 1.'); return; }
    setFormError('');
    if (editingId) {
      updateClass({ id: editingId, f: form });
    } else {
      createClass(form);
    }
  }

  // Build timetable grid: unique sorted times as rows, days as columns
  const activeDays = DAYS.filter(d => classes.some(c => c.day_of_week === d));
  const allTimes = [...new Set(classes.map(c => c.time))].sort((a, b) => {
    // Sort by converting "3:30 PM" → comparable number
    const toMins = (t: string) => {
      const [time, period] = t.split(' ');
      const [h, m] = time.split(':').map(Number);
      return (period === 'PM' && h !== 12 ? h + 12 : h) * 60 + m;
    };
    return toMins(a) - toMins(b);
  });

  const teacherMap = Object.fromEntries(teachers.map(t => [t.id, t]));

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div><h2>Timetable</h2><p>Manage the term class schedule.</p></div>
        <Button icon={Plus} onClick={openAdd}>Add class</Button>
      </div>

      {/* ── Timetable grid ── */}
      <div className="card timetable-card">
        {isLoading && <p style={{ padding: 24, color: 'var(--muted)' }}>Loading…</p>}
        {!isLoading && classes.length === 0 && (
          <div className="timetable-empty">
            <p>No classes added yet. Click <strong>Add class</strong> to build the timetable.</p>
          </div>
        )}
        {!isLoading && classes.length > 0 && (
          <div className="timetable-scroll">
            <table className="timetable-table">
              <thead>
                <tr>
                  <th className="timetable-time-col">Time</th>
                  {activeDays.map(d => <th key={d}>{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {allTimes.map(time => (
                  <tr key={time}>
                    <td className="timetable-time-cell">{time}</td>
                    {activeDays.map(day => {
                      const cell = classes.filter(c => c.day_of_week === day && c.time === time);
                      return (
                        <td key={day} className="timetable-cell">
                          {cell.map(cls => {
                            const teacher = teacherMap[cls.teacher_id];
                            const color = colorFor(cls.subject);
                            return (
                              <div key={cls.id} className={`timetable-chip ${color}`}>
                                <div className="timetable-chip-subject">{cls.subject}</div>
                                {teacher && (
                                  <div className="timetable-chip-teacher">
                                    <span className={`mini-avatar ${teacher.color}-bg`} style={{ width: 16, height: 16, fontSize: 8 }}>{teacher.initials}</span>
                                    {teacher.name}
                                  </div>
                                )}
                                <div className="timetable-chip-meta">{cls.enrolled}/{cls.capacity} enrolled</div>
                                <div className="timetable-chip-actions">
                                  <button onClick={() => openEdit(cls)} title="Edit"><Pencil size={11} /></button>
                                  <button onClick={() => setDeleteId(cls.id)} title="Delete"><Trash2 size={11} /></button>
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

      {/* ── Add / Edit modal ── */}
      {showForm && (
        <div className="modal-backdrop" onClick={closeForm}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <button className="modal-close" onClick={closeForm}><X size={18} /></button>
            <div className="modal-icon"><Plus size={22} /></div>
            <h2>{editingId ? 'Edit class' : 'Add a class'}</h2>
            <p>Fill in the details for this timetable slot.</p>

            <div className="form-grid" style={{ marginTop: 20 }}>
              <label style={{ gridColumn: '1 / -1' }}>
                Subject / Class name
                <select value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })}>
                  {SUBJECTS.map(s => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label>
                Day
                <select value={form.day_of_week} onChange={e => setForm({ ...form, day_of_week: e.target.value })}>
                  {DAYS.map(d => <option key={d}>{d}</option>)}
                </select>
              </label>
              <label>
                Time
                <input
                  value={form.time}
                  onChange={e => setForm({ ...form, time: e.target.value })}
                  placeholder="e.g. 3:30 PM"
                />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                Teacher
                <select value={form.teacher_id} onChange={e => setForm({ ...form, teacher_id: e.target.value })}>
                  <option value="">— Select a teacher —</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label>
                Capacity
                <input
                  type="number"
                  min={1}
                  value={form.capacity}
                  onChange={e => setForm({ ...form, capacity: e.target.value })}
                  placeholder="e.g. 15"
                />
              </label>
            </div>

            {formError && (
              <div className="auth-error" style={{ marginTop: 12 }}>{formError}</div>
            )}

            <Button
              onClick={handleSubmit}
              disabled={creating || updating}
              icon={Check}
              style={{ marginTop: 20 }}
            >
              {creating || updating ? 'Saving…' : editingId ? 'Save changes' : 'Add class'}
            </Button>
            <button className="modal-cancel" onClick={closeForm}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Delete confirm modal ── */}
      {deleteId && (
        <div className="modal-backdrop" onClick={() => setDeleteId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setDeleteId(null)}><X size={18} /></button>
            <h2>Remove this class?</h2>
            <p>This will remove the class from the timetable. Existing bookings will not be affected.</p>
            <Button onClick={() => deleteClass(deleteId)} disabled={deleting}>
              {deleting ? 'Removing…' : 'Yes, remove'}
            </Button>
            <button className="modal-cancel" onClick={() => setDeleteId(null)}>Keep it</button>
          </div>
        </div>
      )}
    </div>
  );
}
