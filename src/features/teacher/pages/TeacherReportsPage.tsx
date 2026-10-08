import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, FileText } from 'lucide-react';
import { dataClient } from '../../../lib/data/client';
import type { SubjectRating } from '../../../types/booking';

const ALL_FAMILY_IDS = ['f1', 'f2', 'f3', 'f4'];
const CURRENT_TERM = 'Term 3, 2025';

type FormState = {
  childId: string;
  overall: number;
  subjects: SubjectRating[];
  strengths: string;
  areas: string;
  note: string;
};

const BLANK: Omit<FormState, 'childId'> = {
  overall: 3,
  subjects: [],
  strengths: '',
  areas: '',
  note: '',
};

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="star-picker">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" className={n <= value ? 'star-on' : 'star-off'} onClick={() => onChange(n)}>★</button>
      ))}
    </div>
  );
}

export function TeacherReportsPage() {
  return <TeacherReportsView teacherId="tch1" />;
}

export function TeacherReportsView({ teacherId }: { teacherId: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>({ childId: '', ...BLANK });
  const [done, setDone] = useState(false);

  const { data: allClasses = [] } = useQuery({ queryKey: ['classInstances'], queryFn: () => dataClient.getClassInstances() });
  const { data: allBookings = [] } = useQuery({
    queryKey: ['allBookings'],
    queryFn: async () => (await Promise.all(ALL_FAMILY_IDS.map(id => dataClient.getBookings(id)))).flat(),
  });
  const { data: allChildren = [] } = useQuery({
    queryKey: ['allChildren'],
    queryFn: async () => (await Promise.all(ALL_FAMILY_IDS.map(id => dataClient.getChildren(id)))).flat(),
  });
  const { data: existingReports = [] } = useQuery({
    queryKey: ['teacherReports', teacherId],
    queryFn: () => dataClient.getReports(teacherId),
  });

  const myClassIds = new Set(allClasses.filter(c => c.teacher_id === teacherId).map(c => c.id));
  const myBookings = allBookings.filter(b => myClassIds.has(b.class_instance_id) && b.status === 'confirmed');
  const enrolledChildIds = new Set(myBookings.map(b => b.child_id));
  const myStudents = allChildren.filter(c => enrolledChildIds.has(c.id));

  const reportedChildIds = new Set(existingReports.map(r => r.child_id));

  const selectedChild = myStudents.find(c => c.id === form.childId);
  const childClass = selectedChild
    ? allClasses.find(c => c.id === myBookings.find(b => b.child_id === selectedChild.id)?.class_instance_id)
    : null;

  // Sync subject rows when child changes
  function selectChild(childId: string) {
    const cls = allClasses.find(c => c.id === myBookings.find(b => b.child_id === childId)?.class_instance_id);
    const subjects: SubjectRating[] = cls ? [{ subject: cls.subject, rating: 3 }] : [];
    setForm({ childId, ...BLANK, subjects });
    setDone(false);
  }

  function setSubjectRating(subject: string, rating: number) {
    setForm(f => ({
      ...f,
      subjects: f.subjects.map(s => s.subject === subject ? { ...s, rating: rating as SubjectRating['rating'] } : s),
    }));
  }

  const { mutate: submit, isPending } = useMutation({
    mutationFn: () => dataClient.createReport({
      child_id: form.childId,
      teacher_id: teacherId,
      term: CURRENT_TERM,
      overall: form.overall as SubjectRating['rating'],
      subjects: form.subjects,
      strengths: form.strengths,
      areas: form.areas,
      note: form.note,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teacherReports', teacherId] });
      setDone(true);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.childId || !form.strengths.trim() || !form.note.trim()) return;
    submit();
  }

  if (done) {
    return (
      <div className="page-stack">
        <div className="report-submitted-banner">
          <CheckCircle size={36} />
          <h2>Report submitted</h2>
          <p>The report for <strong>{selectedChild?.name}</strong> has been saved for {CURRENT_TERM}.</p>
          <button className="btn-primary" onClick={() => { setForm({ childId: '', ...BLANK }); setDone(false); }}>
            Write another report
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div><h2>Student reports</h2><p>Write end-of-term reports for your enrolled students.</p></div>
      </div>

      {/* Student picker */}
      <div className="card">
        <p className="label" style={{ marginBottom: 8 }}>Select student</p>
        <div className="report-student-grid">
          {myStudents.map(child => {
            const alreadyReported = reportedChildIds.has(child.id);
            return (
              <button
                key={child.id}
                type="button"
                className={`report-student-card ${form.childId === child.id ? 'selected' : ''} ${alreadyReported ? 'reported' : ''}`}
                onClick={() => !alreadyReported && selectChild(child.id)}
                disabled={alreadyReported}
              >
                <div className="mini-avatar pink-bg">{child.initials}</div>
                <strong>{child.name}</strong>
                <span>{child.year}</span>
                {alreadyReported && <span className="report-done-badge"><CheckCircle size={12} /> Done</span>}
              </button>
            );
          })}
          {myStudents.length === 0 && (
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>No enrolled students found.</p>
          )}
        </div>
      </div>

      {/* Report form */}
      {form.childId && (
        <form className="card report-form" onSubmit={handleSubmit}>
          <div className="card-heading">
            <div>
              <span className="label">Writing report for</span>
              <h3>{selectedChild?.name} · {childClass?.subject ?? '—'} · {CURRENT_TERM}</h3>
            </div>
            <FileText size={20} style={{ color: 'var(--muted)' }} />
          </div>

          <div className="report-field">
            <label>Overall progress</label>
            <StarPicker value={form.overall} onChange={v => setForm(f => ({ ...f, overall: v }))} />
          </div>

          {form.subjects.map(s => (
            <div className="report-field" key={s.subject}>
              <label>{s.subject} rating</label>
              <StarPicker value={s.rating} onChange={v => setSubjectRating(s.subject, v)} />
            </div>
          ))}

          <div className="report-field">
            <label>Strengths</label>
            <textarea
              rows={3}
              placeholder="What has this student done well this term?"
              value={form.strengths}
              onChange={e => setForm(f => ({ ...f, strengths: e.target.value }))}
              required
            />
          </div>

          <div className="report-field">
            <label>Areas to continue</label>
            <textarea
              rows={3}
              placeholder="What should the student keep working on?"
              value={form.areas}
              onChange={e => setForm(f => ({ ...f, areas: e.target.value }))}
            />
          </div>

          <div className="report-field">
            <label>Tutor note to parent</label>
            <textarea
              rows={3}
              placeholder="A personal note for the parent..."
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={isPending} style={{ alignSelf: 'flex-start' }}>
            {isPending ? 'Saving…' : 'Submit report'}
          </button>
        </form>
      )}
    </div>
  );
}
