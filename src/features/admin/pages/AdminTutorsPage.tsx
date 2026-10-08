import { MoreHorizontal, Plus, UserRound, X, Check } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { dataClient } from '../../../lib/data/client';

const colours = ['pink', 'yellow', 'teal', 'orange', 'green', 'magenta'];

export function AdminTutorsPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', subjects: '', contact: '' });

  const { data: teachers = [], isLoading } = useQuery({
    queryKey: ['teachers'],
    queryFn: () => dataClient.getTeachers(),
  });

  const { data: classInstances = [] } = useQuery({
    queryKey: ['classInstances'],
    queryFn: () => dataClient.getClassInstances(),
  });

  // Count enrolled students per teacher
  const studentsByTeacher = classInstances.reduce<Record<string, number>>((acc, cls) => {
    acc[cls.teacher_id] = (acc[cls.teacher_id] ?? 0) + cls.enrolled;
    return acc;
  }, {});

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div><h2>{teachers.length} active tutors</h2><p>The wonderful people guiding every session.</p></div>
        <Button icon={Plus} onClick={() => setShowAdd(true)}>Add tutor</Button>
      </div>

      {isLoading && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</p>}

      <div className="tutor-grid">
        {teachers.map((t, i) => {
          const myClasses = classInstances.filter(c => c.teacher_id === t.id);
          const color = t.color ?? colours[i % colours.length];
          return (
            <div className="card tutor-card" key={t.id}>
              <div className="tutor-card-head">
                <div className={`mini-avatar ${color}-bg`}>{t.initials}</div>
                <div><strong>{t.name}</strong><span>{studentsByTeacher[t.id] ?? 0} active students</span></div>
                <MoreHorizontal size={18} />
              </div>
              <div className="tutor-subjects">
                {t.subjects.map(s => <span key={s} className={`tutor-subject-tag ${color}`}>{s}</span>)}
              </div>
              <div className="tutor-classes">
                <span className="label">Classes assigned</span>
                {myClasses.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)' }}>No classes assigned yet.</p>}
                {myClasses.map(c => (
                  <div className="tutor-class-row" key={c.id}>
                    <span className={`today-dot ${color}`} />
                    <div><strong>{c.subject}</strong><span>{c.day_of_week} · {c.time}</span></div>
                    <b>{c.enrolled}/{c.capacity}</b>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {showAdd && (
        <div className="modal-backdrop" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowAdd(false)}><X size={18} /></button>
            <div className="modal-icon"><UserRound size={22} /></div>
            <h2>Add tutor</h2>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>Tutor accounts will be created via Supabase auth when the backend is implemented.</p>
            <div className="add-modal-form">
              <label>Tutor name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Rebecca Martin" /></label>
              <label>Subject(s) taught<input value={form.subjects} onChange={e => setForm({ ...form, subjects: e.target.value })} placeholder="e.g. Mathematics, English" /></label>
              <label>Contact<input value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} placeholder="e.g. rebecca@email.com" /></label>
            </div>
            <div className="review-actions">
              <Button variant="ghost" onClick={() => setShowAdd(false)} icon={X}>Cancel</Button>
              <Button onClick={() => setShowAdd(false)} icon={Check}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
