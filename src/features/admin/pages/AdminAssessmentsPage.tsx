import { Check, ClipboardList, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { dataClient } from '../../../lib/data/client';
import { qk } from '../../../lib/data/queryKeys';
import { toAppError } from '../../../lib/data/errors';
import type { Assessment } from '../../../types/booking';

type Tab = 'new-students' | 'term';

const TIMES = ['3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM', '5:00 PM'];

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }: { status: Assessment['status'] }) {
  const cls: Record<string, string> = { scheduled: 'confirmed', completed: 'confirmed', awaiting_payment: 'pending', cancelled: 'failed' };
  const label: Record<string, string> = { scheduled: 'Scheduled', completed: 'Completed', awaiting_payment: 'Awaiting payment', cancelled: 'Cancelled' };
  return <span className={`table-status ${cls[status] ?? ''}`}>{label[status] ?? status}</span>;
}

// ── Detail modal ──────────────────────────────────────────────────────────────
function AssessmentDetailModal({
  assessment,
  onClose,
  onComplete,
}: {
  assessment: Assessment;
  onClose: () => void;
  onComplete: () => void;
}) {
  const child   = (assessment as any).child;
  const teacher = (assessment as any).teacher;
  const childName = child?.name ?? child?.given_name ?? assessment.child_id;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
        <div className="modal-icon"><ClipboardList size={22} /></div>
        <h2 style={{ marginBottom: 4 }}>Assessment details</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
          {assessment.payment_id ? 'Booked by parent (new student)' : 'Scheduled by admin (term)'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <DetailRow label="Student"    value={childName} />
          <DetailRow label="Teacher"    value={teacher?.name ?? (assessment.teacher_id ?? '—')} />
          <DetailRow label="Date"       value={assessment.scheduled_date ? fmtDate(assessment.scheduled_date) : '—'} />
          <DetailRow label="Time"       value={assessment.scheduled_time ?? '—'} />
          <DetailRow label="Status"     value={<StatusBadge status={assessment.status} />} />
          {assessment.notes && <DetailRow label="Notes" value={assessment.notes} />}
          {assessment.payment_id && (
            <DetailRow label="Payment" value={<span style={{ fontFamily: 'monospace', fontSize: 12 }}>{assessment.payment_id}</span>} />
          )}
        </div>

        <div className="review-actions" style={{ marginTop: 20 }}>
          <Button variant="ghost" onClick={onClose} icon={X}>Close</Button>
          {assessment.status === 'scheduled' && (
            <Button icon={Check} onClick={() => { onComplete(); onClose(); }}>
              Mark complete
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="review-detail-row">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

// ── Assessment table ──────────────────────────────────────────────────────────
function AssessmentTable({
  assessments,
  onSelect,
}: {
  assessments: Assessment[];
  onSelect: (a: Assessment) => void;
}) {
  if (assessments.length === 0) return null;
  return (
    <div className="card table-card">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Teacher</th>
              <th>Date</th>
              <th>Time</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {assessments.map(a => {
              const child   = (a as any).child;
              const teacher = (a as any).teacher;
              const childName = child?.name ?? child?.given_name ?? a.child_id;
              return (
                <tr
                  key={a.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onSelect(a)}
                >
                  <td style={{ fontWeight: 600 }}>{childName}</td>
                  <td>{teacher?.name ?? '—'}</td>
                  <td>{a.scheduled_date ? fmtDate(a.scheduled_date) : '—'}</td>
                  <td>{a.scheduled_time ?? '—'}</td>
                  <td><StatusBadge status={a.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function AdminAssessmentsPage() {
  const qc = useQueryClient();
  const [tab, setTab]           = useState<Tab>('new-students');
  const [showAdd, setShowAdd]   = useState(false);
  const [selected, setSelected] = useState<Assessment | null>(null);
  const [form, setForm]         = useState({ programId: '', date: '', time: '3:30 PM' });
  const [addError, setAddError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const { data: newStudentAssessments = [], isLoading: loadingNew } = useQuery({
    queryKey: qk.adminNewStudentAssessments,
    queryFn: () => dataClient.getAdminNewStudentAssessments!(),
  });

  const { data: termAssessments = [], isLoading: loadingTerm } = useQuery({
    queryKey: qk.adminTermAssessments,
    queryFn: () => dataClient.getAdminTermAssessments!(),
  });

  const { data: programs = [] } = useQuery({
    queryKey: qk.programs,
    queryFn: () => dataClient.getPrograms(),
  });

  const { mutate: markComplete } = useMutation({
    mutationFn: (id: string) => dataClient.updateAssessment(id, { status: 'completed' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.adminNewStudentAssessments });
      qc.invalidateQueries({ queryKey: qk.adminTermAssessments });
    },
  });

  const { mutate: createSubjectAssessments, isPending: creating } = useMutation({
    mutationFn: () => {
      if (!form.programId || !form.date || !form.time) throw new Error('Please fill in all fields.');
      return dataClient.adminCreateSubjectAssessments!({
        programId: form.programId,
        date: form.date,
        time: form.time,
      });
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: qk.adminTermAssessments });
      setForm({ programId: '', date: '', time: '3:30 PM' });
      setShowAdd(false);
      setAddError('');
      setSuccessMsg(
        result.count === 0
          ? `No new assessments created — all enrolled students already have an assessment on that date.`
          : `${result.count} assessment${result.count === 1 ? '' : 's'} scheduled for ${result.program} with ${result.teacher}. Families and teacher have been notified.`
      );
      setTimeout(() => setSuccessMsg(''), 7000);
    },
    onError: (e) => setAddError(toAppError(e).message),
  });

  const activeList  = tab === 'new-students' ? newStudentAssessments : termAssessments;
  const isLoading   = tab === 'new-students' ? loadingNew : loadingTerm;
  const emptyMsg    = tab === 'new-students'
    ? 'No new student assessments yet.'
    : 'No term assessments scheduled yet.';
  const description = tab === 'new-students'
    ? 'These assessments were booked and paid for by parents of unenrolled students.'
    : 'These assessments are created by admin for enrolled students each term.';

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div><h2>Assessments</h2><p>Manage all student assessments.</p></div>
        {tab === 'term' && (
          <Button icon={Plus} onClick={() => { setShowAdd(true); setAddError(''); }}>Schedule assessments</Button>
        )}
      </div>

      {successMsg && (
        <div className="card" style={{ padding: '12px 16px', background: 'var(--teal-light, #e6faf8)', fontSize: 13, color: 'var(--teal)' }}>
          <Check size={14} style={{ display: 'inline', marginRight: 6 }} />{successMsg}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="table-filters" style={{ background: 'var(--card)', borderRadius: 12, padding: '4px', display: 'inline-flex', gap: 4 }}>
        <button className={tab === 'new-students' ? 'filter-active' : ''} onClick={() => setTab('new-students')}>
          New students <span>{newStudentAssessments.length}</span>
        </button>
        <button className={tab === 'term' ? 'filter-active' : ''} onClick={() => setTab('term')}>
          Term assessments <span>{termAssessments.length}</span>
        </button>
      </div>

      <p style={{ fontSize: 13, color: 'var(--muted)' }}>{description}</p>

      {isLoading && <p style={{ color: 'var(--muted)', fontSize: 14 }}>Loading…</p>}

      {!isLoading && activeList.length === 0 && (
        <div className="card" style={{ padding: 20 }}>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>{emptyMsg}</p>
        </div>
      )}

      {!isLoading && activeList.length > 0 && (
        <AssessmentTable assessments={activeList} onSelect={setSelected} />
      )}

      {/* ── Detail modal ── */}
      {selected && (
        <AssessmentDetailModal
          assessment={selected}
          onClose={() => setSelected(null)}
          onComplete={() => markComplete(selected.id)}
        />
      )}

      {/* ── Schedule term assessments modal ── */}
      {showAdd && (
        <div className="modal-backdrop" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowAdd(false)}><X size={18} /></button>
            <div className="modal-icon"><ClipboardList size={22} /></div>
            <h2>Schedule term assessments</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
              Select a subject. Assessments will be created for all enrolled students in that subject's class.
              The assigned teacher and each family will be notified automatically.
            </p>
            {addError && <p className="auth-error">{addError}</p>}
            <div className="add-modal-form">
              <label>
                Subject
                <select value={form.programId} onChange={e => setForm(f => ({ ...f, programId: e.target.value }))}>
                  <option value="">Select subject…</option>
                  {programs.filter(p => p.is_active).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Date
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </label>
              <label>
                Time
                <select value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))}>
                  {TIMES.map(t => <option key={t}>{t}</option>)}
                </select>
              </label>
            </div>
            <div className="review-actions">
              <Button variant="ghost" onClick={() => setShowAdd(false)} icon={X}>Cancel</Button>
              <Button
                icon={Check}
                onClick={() => createSubjectAssessments()}
                disabled={!form.programId || !form.date || creating}
              >
                {creating ? 'Scheduling…' : 'Schedule'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
