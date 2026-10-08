import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardList, Plus, X } from 'lucide-react';
import { dataClient } from '../../../lib/data/client';
import { Button } from '../../../components/ui/Button';

const ALL_FAMILY_IDS = ['f1', 'f2', 'f3', 'f4'];
const TIMES = ['3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM', '5:00 PM'];

function fmtDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

export function TeacherAssessmentsPage() {
  return <TeacherAssessmentsView teacherId="tch1" />;
}

export function TeacherAssessmentsView({ teacherId }: { teacherId: string }) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ classId: '', date: '', time: '3:30 PM' });

  const { data: allClasses = [] } = useQuery({ queryKey: ['classInstances'], queryFn: () => dataClient.getClassInstances() });
  const { data: allBookings = [] } = useQuery({
    queryKey: ['allBookings'],
    queryFn: async () => (await Promise.all(ALL_FAMILY_IDS.map(id => dataClient.getBookings(id)))).flat(),
  });
  const { data: allChildren = [] } = useQuery({
    queryKey: ['allChildren'],
    queryFn: async () => (await Promise.all(ALL_FAMILY_IDS.map(id => dataClient.getChildren(id)))).flat(),
  });
  const { data: assessments = [], isLoading } = useQuery({
    queryKey: ['teacherAssessments', teacherId],
    queryFn: () => dataClient.getTeacherAssessments(teacherId),
  });

  const myClasses = allClasses.filter(c => c.teacher_id === teacherId);
  const myClassIds = new Set(myClasses.map(c => c.id));
  const myBookings = allBookings.filter(b => myClassIds.has(b.class_instance_id) && b.status === 'confirmed');

  // Classes that already have an assessment scheduled
  const assessedClassIds = new Set(assessments.map(a => a.class_instance_id));

  const { mutate: create, isPending } = useMutation({
    mutationFn: async () => {
      const classBookings = myBookings.filter(b => b.class_instance_id === form.classId);
      // Create one assessment record per enrolled student in the class
      await Promise.all(classBookings.map(b => {
        const child = allChildren.find(c => c.id === b.child_id);
        return dataClient.createTeacherAssessment({
          child_id: b.child_id,
          family_id: child?.family_id,
          teacher_id: teacherId,
          class_instance_id: form.classId,
          date: form.date,
          time: form.time,
          outcome: 'pending',
        });
      }));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teacherAssessments', teacherId] });
      setForm({ classId: '', date: '', time: '3:30 PM' });
      setShowAdd(false);
    },
  });

  // Group assessments by class
  const byClass = myClasses
    .map(cls => {
      const rows = assessments.filter(a => a.class_instance_id === cls.id);
      if (rows.length === 0) return null;
      const first = rows[0];
      const students = rows.map(a => allChildren.find(c => c.id === a.child_id)?.name ?? '—');
      const allComplete = rows.every(a => a.outcome === 'complete');
      return { cls, date: first.date, time: first.time, students, outcome: allComplete ? 'complete' : 'pending' };
    })
    .filter(Boolean) as { cls: typeof myClasses[0]; date?: string; time?: string; students: string[]; outcome: string }[];

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div><h2>Assessments</h2><p>Schedule assessments for your classes.</p></div>
        <Button icon={Plus} onClick={() => setShowAdd(true)}>Schedule assessment</Button>
      </div>

      {isLoading ? (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>Loading…</p>
      ) : byClass.length === 0 ? (
        <div className="card" style={{ padding: 20 }}>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>No assessments scheduled yet.</p>
        </div>
      ) : (
        byClass.map(({ cls, date, time, students, outcome }) => (
          <div className={`card admin-class pink`} key={cls.id} style={{ gap: 10 }}>
            <div className="class-card-top">
              <span className="class-subject">{cls.subject}</span>
              <span className={`status-badge ${outcome === 'complete' ? 'green' : 'yellow'}`}>
                {outcome === 'complete' ? 'Complete' : 'Pending'}
              </span>
            </div>
            <h3>{cls.day_of_week} · {cls.time}</h3>
            <div className="review-detail-row"><span>Assessment date</span><b>{date ? fmtDate(date) : '—'} at {time}</b></div>
            <div className="review-detail-row"><span>Students</span><b>{students.join(', ')}</b></div>
          </div>
        ))
      )}

      {showAdd && (
        <div className="modal-backdrop" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowAdd(false)}><X size={18} /></button>
            <div className="modal-icon"><ClipboardList size={22} /></div>
            <h2>Schedule assessment</h2>
            <div className="add-modal-form">
              <label>Class
                <select value={form.classId} onChange={e => setForm({ ...form, classId: e.target.value })}>
                  <option value="">Select class…</option>
                  {myClasses.map(c => (
                    <option key={c.id} value={c.id} disabled={assessedClassIds.has(c.id)}>
                      {c.subject} — {c.day_of_week} {c.time}{assessedClassIds.has(c.id) ? ' (scheduled)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              {form.classId && (
                <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: -4 }}>
                  {myBookings.filter(b => b.class_instance_id === form.classId).length} enrolled students will be assessed.
                </p>
              )}
              <label>Date<input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
              <label>Time
                <select value={form.time} onChange={e => setForm({ ...form, time: e.target.value })}>
                  {TIMES.map(t => <option key={t}>{t}</option>)}
                </select>
              </label>
            </div>
            <div className="review-actions">
              <Button variant="ghost" onClick={() => setShowAdd(false)} icon={X}>Cancel</Button>
              <Button onClick={() => { if (form.classId && form.date) create(); }} icon={Check} disabled={!form.classId || !form.date || isPending}>
                {isPending ? 'Saving…' : 'Schedule'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
