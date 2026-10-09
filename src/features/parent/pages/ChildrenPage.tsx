import { ArrowRight, Check, MoreHorizontal, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { dataClient } from '../../../lib/data/client';
import { useAuth } from '../../../app/providers';
import { qk } from '../../../lib/data/queryKeys';
import { toAppError } from '../../../lib/data/errors';

export function ChildrenPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { familyId } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ givenName: '', familyName: '', year: 'Year 1', school: '' });
  const [addError, setAddError] = useState('');

  const { data: children = [], isLoading } = useQuery({
    queryKey: qk.children(familyId),
    queryFn: () => dataClient.getChildren(familyId),
    enabled: !!familyId,
  });

  const addChild = useMutation({
    mutationFn: () => dataClient.addChild(familyId, {
      givenName: form.givenName.trim(),
      familyName: form.familyName.trim(),
      year: form.year,
      school: form.school.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.children(familyId) });
      setForm({ givenName: '', familyName: '', year: 'Year 1', school: '' });
      setAddError('');
      setShowAdd(false);
    },
    onError: (e) => setAddError(toAppError(e).message),
  });

  const handleAdd = () => {
    if (!form.givenName.trim()) { setAddError('Please enter a given name.'); return; }
    if (!form.familyName.trim()) { setAddError('Please enter a family name.'); return; }
    setAddError('');
    addChild.mutate();
  };

  if (isLoading) return <div className="page-stack"><p>Loading…</p></div>;

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div><h2>Meet the learners</h2><p>Every child has their own kind of brilliant.</p></div>
        <Button icon={Plus} onClick={() => setShowAdd(true)}>Add a child</Button>
      </div>
      <div className="children-grid">
        {children.map(c => (
          <div className="card child-card" key={c.id}>
            <div className="child-card-head">
              <div className="child-avatar large">{c.initials}</div>
              <div><h3>{c.name}</h3><span>{c.year} · {c.school}</span></div>
              <button><MoreHorizontal size={18} /></button>
            </div>
            {c.subjects && c.subjects.length > 0 && (
              <div className="focus-tags">{c.subjects.map(s => <span key={s}>{s}</span>)}</div>
            )}
            <Button variant="soft" onClick={() => navigate(`/parent/children/${c.id}`)} icon={ArrowRight}>View profile</Button>
          </div>
        ))}
        {children.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '32px 24px' }}>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>No children added yet.</p>
            <Button icon={Plus} onClick={() => setShowAdd(true)}>Add your first child</Button>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="modal-backdrop" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowAdd(false)}><X size={18} /></button>
            <div className="modal-icon"><Plus size={22} /></div>
            <h2>Add a child</h2>
            <p>Tell us a little about your child to add them to your family dashboard.</p>
            <div className="add-modal-form">
              <label>Given name<input value={form.givenName} onChange={e => setForm({ ...form, givenName: e.target.value })} placeholder="e.g. Charlie" /></label>
              <label>Family name<input value={form.familyName} onChange={e => setForm({ ...form, familyName: e.target.value })} placeholder="e.g. Smith" /></label>
              <label>Year level
                <select value={form.year} onChange={e => setForm({ ...form, year: e.target.value })}>
                  {['Year 1','Year 2','Year 3','Year 4','Year 5','Year 6'].map(y => <option key={y}>{y}</option>)}
                </select>
              </label>
              <label>School<input value={form.school} onChange={e => setForm({ ...form, school: e.target.value })} placeholder="e.g. Example Primary School" /></label>
            </div>
            {addError && <p className="auth-error">{addError}</p>}
            <Button onClick={handleAdd} icon={Check} disabled={addChild.isPending}>
              {addChild.isPending ? 'Adding…' : 'Add child'}
            </Button>
            <button className="modal-cancel" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
