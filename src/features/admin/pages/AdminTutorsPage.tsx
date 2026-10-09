import { Check, MoreHorizontal, Plus, UserRound, X } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { dataClient } from '../../../lib/data/client';
import { qk } from '../../../lib/data/queryKeys';
import { toAppError } from '../../../lib/data/errors';

const COLOURS = ['pink', 'yellow', 'teal', 'orange', 'green', 'magenta'];
const SUBJECT_OPTIONS = ['Mathematics', 'English', 'Reading & Spelling', 'Maths & English', 'Science'];

type InviteForm = {
  email: string;
  fullName: string;
  role: 'teacher' | 'admin';
  subjects: string[];
  color: string;
};

const EMPTY_FORM: InviteForm = { email: '', fullName: '', role: 'teacher', subjects: [], color: 'pink' };

export function AdminTutorsPage() {
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [form, setForm] = useState<InviteForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  const { data: teachers = [], isLoading } = useQuery({
    queryKey: qk.teachers,
    queryFn: () => dataClient.getTeachers(),
  });

  const { data: classSlots = [] } = useQuery({
    queryKey: qk.classSlots,
    queryFn: () => dataClient.getClassSlots(),
  });

  const { mutate: invite, isPending: inviting } = useMutation({
    mutationFn: (f: InviteForm) => dataClient.inviteStaff({
      email: f.email.trim().toLowerCase(),
      fullName: f.fullName.trim(),
      role: f.role,
      subjects: f.subjects,
      color: f.color,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.teachers });
      setInviteSuccess(`Invite sent to ${form.email}. They will receive an email to set their password.`);
      setForm(EMPTY_FORM);
      setFormError('');
    },
    onError: (e: Error) => setFormError(toAppError(e).message),
  });

  function toggleSubject(s: string) {
    setForm(f => ({
      ...f,
      subjects: f.subjects.includes(s) ? f.subjects.filter(x => x !== s) : [...f.subjects, s],
    }));
  }

  function handleSubmit() {
    if (!form.email.trim() || !form.email.includes('@')) { setFormError('A valid email is required.'); return; }
    if (!form.fullName.trim()) { setFormError('Full name is required.'); return; }
    setFormError('');
    invite(form);
  }

  function closeModal() {
    setShowInvite(false);
    setForm(EMPTY_FORM);
    setFormError('');
    setInviteSuccess('');
  }

  // Count booked students per teacher from class slots
  const studentsByTeacher = classSlots.reduce<Record<string, number>>((acc, slot) => {
    acc[slot.teacher_id] = (acc[slot.teacher_id] ?? 0) + slot.next_booked_count;
    return acc;
  }, {});

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div><h2>{teachers.length} active tutor{teachers.length !== 1 ? 's' : ''}</h2><p>The wonderful people guiding every session.</p></div>
        <Button icon={Plus} onClick={() => { setShowInvite(true); setInviteSuccess(''); }}>Invite tutor</Button>
      </div>

      {isLoading && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</p>}

      <div className="tutor-grid">
        {teachers.map((t, i) => {
          const mySlots = classSlots.filter(s => s.teacher_id === t.id);
          const color = t.color ?? COLOURS[i % COLOURS.length];
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
                {mySlots.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)' }}>No classes assigned yet.</p>}
                {mySlots.map(slot => (
                  <div className="tutor-class-row" key={slot.id}>
                    <span className={`today-dot ${color}`} />
                    <div>
                      <strong>{slot.subject}</strong>
                      <span>{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][slot.day_of_week - 1]} · {slot.start_time}</span>
                    </div>
                    <b>{slot.next_booked_count}/{slot.capacity}</b>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {showInvite && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModal}><X size={18} /></button>
            <div className="modal-icon"><UserRound size={22} /></div>
            <h2>Invite tutor</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>They will receive an email with a link to set their password.</p>

            {inviteSuccess ? (
              <>
                <div className="auth-success" style={{ marginTop: 16 }}>{inviteSuccess}</div>
                <Button onClick={closeModal} style={{ marginTop: 16 }}>Done</Button>
              </>
            ) : (
              <>
                <div className="add-modal-form">
                  <label>
                    Full name
                    <input value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} placeholder="e.g. Rebecca Martin" />
                  </label>
                  <label>
                    Email address
                    <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="e.g. rebecca@email.com" />
                  </label>
                  <label>
                    Role
                    <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value as 'teacher' | 'admin' })}>
                      <option value="teacher">Teacher</option>
                      <option value="admin">Admin (also a teacher)</option>
                    </select>
                  </label>
                  <label>
                    Colour
                    <select value={form.color} onChange={e => setForm({ ...form, color: e.target.value })}>
                      {COLOURS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                    </select>
                  </label>
                  <div>
                    <span className="label" style={{ display: 'block', marginBottom: 6 }}>Subjects</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {SUBJECT_OPTIONS.map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => toggleSubject(s)}
                          className={`tutor-subject-tag ${form.subjects.includes(s) ? form.color : ''}`}
                          style={{ cursor: 'pointer', opacity: form.subjects.includes(s) ? 1 : 0.45 }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {formError && <div className="auth-error" style={{ marginTop: 8 }}>{formError}</div>}
                <div className="review-actions">
                  <Button variant="ghost" onClick={closeModal} icon={X}>Cancel</Button>
                  <Button onClick={handleSubmit} disabled={inviting} icon={Check}>
                    {inviting ? 'Sending invite…' : 'Send invite'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
