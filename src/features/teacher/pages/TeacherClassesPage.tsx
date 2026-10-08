import { Check, MoreHorizontal, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Progress } from '../../../components/ui/Progress';
import { INDIVIDUAL_CLASS_PRICE } from '../../../lib/config';

// TODO: confirm with client — teacher-set price is currently treated as internal/admin-facing only.
// It does NOT affect what parents pay during term-credit booking (always 1 credit).
// Only surfaces here (teacher view) and in the individual class purchase flow.
// See lib/config.ts TEACHER_PRICE_IS_PARENT_FACING.

type TeacherClass = { subject: string; day: string; time: string; enrolled: number; capacity: number; color: string; price: number; };

const DEFAULT_PRICE = INDIVIDUAL_CLASS_PRICE;

export function TeacherClassesPage() {
  const [classes, setClasses] = useState<TeacherClass[]>([
    { subject: 'Mathematics', day: 'Monday', time: '3:30 PM', enrolled: 12, capacity: 15, color: 'pink', price: DEFAULT_PRICE },
    { subject: 'Mathematics', day: 'Thursday', time: '3:30 PM', enrolled: 10, capacity: 15, color: 'pink', price: DEFAULT_PRICE },
    { subject: 'English', day: 'Wednesday', time: '4:30 PM', enrolled: 13, capacity: 15, color: 'teal', price: DEFAULT_PRICE },
  ]);
  const [showAdd, setShowAdd] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [form, setForm] = useState({ subject: '', day: 'Monday', time: '', capacity: '15', price: String(DEFAULT_PRICE) });

  const save = () => {
    if (!form.subject.trim() || !form.time.trim()) return;
    const cls: TeacherClass = {
      subject: form.subject, day: form.day, time: form.time,
      enrolled: 0, capacity: parseInt(form.capacity) || 15,
      color: 'pink', price: parseFloat(form.price) || DEFAULT_PRICE,
    };
    if (editIdx !== null) {
      setClasses(cs => cs.map((c, i) => i === editIdx ? { ...c, ...cls, enrolled: c.enrolled } : c));
      setEditIdx(null);
    } else {
      setClasses(cs => [...cs, cls]);
    }
    setForm({ subject: '', day: 'Monday', time: '', capacity: '15', price: String(DEFAULT_PRICE) });
    setShowAdd(false);
  };

  const openEdit = (i: number) => {
    const c = classes[i];
    setForm({ subject: c.subject, day: c.day, time: c.time, capacity: String(c.capacity), price: String(c.price) });
    setEditIdx(i);
    setShowAdd(true);
  };

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div><h2>My classes</h2><p>Your timetable and pricing.</p></div>
        <Button icon={Plus} onClick={() => {
          setEditIdx(null);
          setForm({ subject: '', day: 'Monday', time: '', capacity: '15', price: String(DEFAULT_PRICE) });
          setShowAdd(true);
        }}>Add class</Button>
      </div>
      <div className="admin-class-grid">
        {classes.map((c, i) => (
          <div className={`card admin-class ${c.color}`} key={i}>
            <div className="class-card-top">
              <span className="class-subject">{c.subject}</span>
              <button onClick={() => openEdit(i)}><MoreHorizontal size={18} /></button>
            </div>
            <h3>{c.day}</h3>
            <strong>{c.time}</strong>
            <div className="capacity">
              <span>Enrolled</span><b>{c.enrolled} / {c.capacity}</b>
              <Progress value={(c.enrolled / c.capacity) * 100} color={c.color} />
            </div>
            {/* TODO: confirm with client — price shown here is internal/teacher-facing only.
                Does not affect parent billing during term-credit booking. */}
            <div className="review-detail-row"><span>Class price</span><b>${c.price}</b></div>
          </div>
        ))}
      </div>

      {showAdd && (
        <div className="modal-backdrop" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowAdd(false)}><X size={18} /></button>
            <h2>{editIdx !== null ? 'Edit class' : 'Add class'}</h2>
            <div className="add-modal-form">
              <label>Subject<input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Mathematics" /></label>
              <label>Day
                <select value={form.day} onChange={e => setForm({ ...form, day: e.target.value })}>
                  {['Monday','Tuesday','Wednesday','Thursday','Friday'].map(d => <option key={d}>{d}</option>)}
                </select>
              </label>
              <label>Time<input value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} placeholder="e.g. 3:30 PM" /></label>
              <label>Max capacity<input value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} placeholder="15" /></label>
              {/* TODO: confirm with client — whether teacher price affects parent billing or is internal/payroll only */}
              <label>
                Class price ($)
                <input value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder={String(DEFAULT_PRICE)} />
                <small style={{ color: 'var(--muted)', fontSize: 11 }}>Internal use only — does not affect term-credit booking cost.</small>
              </label>
            </div>
            <div className="review-actions">
              <Button variant="ghost" onClick={() => setShowAdd(false)} icon={X}>Cancel</Button>
              <Button onClick={save} icon={Check}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
