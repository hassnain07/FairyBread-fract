import { BookOpen, Check, MoreHorizontal, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { dataClient } from '../../../lib/data/client';
import { qk } from '../../../lib/data/queryKeys';
import { toAppError } from '../../../lib/data/errors';
import type { Program } from '../../../types/teacher';

const COLOURS = ['pink', 'yellow', 'teal', 'orange', 'green', 'magenta'];

type ProgramForm = { name: string; description: string; color: string; is_active: boolean };
const EMPTY_FORM: ProgramForm = { name: '', description: '', color: 'pink', is_active: true };

export function AdminProgramsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProgramForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');

  const { data: programs = [], isLoading } = useQuery({
    queryKey: qk.programs,
    queryFn: () => dataClient.getPrograms(),
  });

  const { mutate: upsert, isPending: saving } = useMutation({
    mutationFn: (f: ProgramForm) => dataClient.upsertProgram({
      id: editingId ?? undefined,
      name: f.name,
      description: f.description || undefined,
      color: f.color,
      is_active: f.is_active,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.programs });
      closeForm();
    },
    onError: (e: Error) => setFormError(toAppError(e).message),
  });

  function openAdd() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, color: COLOURS[programs.length % COLOURS.length] });
    setFormError('');
    setShowForm(true);
  }

  function openEdit(p: Program) {
    setEditingId(p.id);
    setForm({ name: p.name, description: p.description ?? '', color: p.color ?? 'pink', is_active: p.is_active });
    setFormError('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setFormError('');
  }

  function handleSubmit() {
    if (!form.name.trim()) { setFormError('Program name is required.'); return; }
    setFormError('');
    upsert(form);
  }

  const active = programs.filter(p => p.is_active);

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div><h2>{active.length} active program{active.length !== 1 ? 's' : ''}</h2><p>The subjects we offer and who is enrolled.</p></div>
        <Button icon={Plus} onClick={openAdd}>Add program</Button>
      </div>

      {isLoading && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</p>}

      {!isLoading && programs.length === 0 && (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
          <p>No programs yet. Click <strong>Add program</strong> to get started.</p>
        </div>
      )}

      <div className="program-admin-grid">
        {programs.map(p => (
          <div className="card program-admin-card" key={p.id} style={{ opacity: p.is_active ? 1 : 0.55 }}>
            <div className="program-admin-head">
              <div className={`program-icon ${p.color ?? 'pink'}-bg`}><BookOpen size={19} /></div>
              <div>
                <strong>{p.name}</strong>
                <span>{p.is_active ? 'Active' : 'Inactive'}</span>
              </div>
              <button onClick={() => openEdit(p)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                <MoreHorizontal size={18} />
              </button>
            </div>
            {p.description && <p>{p.description}</p>}
          </div>
        ))}
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={closeForm}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={closeForm}><X size={18} /></button>
            <div className="modal-icon"><BookOpen size={22} /></div>
            <h2>{editingId ? 'Edit program' : 'Add program'}</h2>
            <div className="add-modal-form">
              <label>
                Program name
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Science" />
              </label>
              <label>
                Description
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="e.g. Hands-on science for curious minds" />
              </label>
              <label>
                Colour
                <select value={form.color} onChange={e => setForm({ ...form, color: e.target.value })}>
                  {COLOURS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                Active (visible to teachers and parents)
              </label>
            </div>
            {formError && <div className="auth-error" style={{ marginTop: 8 }}>{formError}</div>}
            <div className="review-actions">
              <Button variant="ghost" onClick={closeForm} icon={X}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={saving} icon={Check}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
