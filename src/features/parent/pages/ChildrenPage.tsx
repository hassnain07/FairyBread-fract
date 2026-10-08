import { ArrowRight, Check, MoreHorizontal, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { Progress } from '../../../components/ui/Progress';
import { dataClient } from '../../../lib/data/client';
import { useAuth } from '../../../app/providers';

// Static enrichment per child id
const enrichment: Record<string, { maths: number; english: number }> = {
  c1: { maths: 80, english: 72 },
  c2: { maths: 64, english: 78 },
};

export function ChildrenPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { familyId } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', year: 'Year 1', school: '' });

  const { data: children = [] } = useQuery({
    queryKey: ['children', familyId],
    queryFn: () => dataClient.getChildren(familyId),
  });

  const addChild = useMutation({
    mutationFn: (child: { name: string; year: string; school: string; initials: string }) =>
      dataClient.addChild(familyId, child),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['children', familyId] });
      setForm({ name: '', year: 'Year 1', school: '' });
      setShowAdd(false);
    },
  });

  const handleAdd = () => {
    if (!form.name.trim()) return;
    const initials = form.name.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();
    addChild.mutate({ name: form.name, initials, year: form.year, school: form.school || 'School not set' });
  };

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div><h2>Meet the learners</h2><p>Every child has their own kind of brilliant.</p></div>
        <Button icon={Plus} onClick={() => setShowAdd(true)}>Add a child</Button>
      </div>
      <div className="children-grid">
        {children.map(c => {
          const e = enrichment[c.id] ?? { maths: 0, english: 0 };
          return (
            <div className="card child-card" key={c.id}>
              <div className="child-card-head">
                <div className="child-avatar large">{c.initials}</div>
                <div><h3>{c.name}</h3><span>{c.year} · {c.school}</span></div>
                <button><MoreHorizontal size={18} /></button>
              </div>
              <div className="focus-tags"><span>Mathematics</span><span>Reading</span><span>Spelling</span></div>
              <div className="metric-line"><span>Mathematics <b>{e.maths}%</b></span><Progress value={e.maths} color="pink" /></div>
              <div className="metric-line"><span>English <b>{e.english}%</b></span><Progress value={e.english} color="teal" /></div>
              <Button variant="soft" onClick={() => navigate(`/parent/children/${c.id}`)} icon={ArrowRight}>View profile</Button>
            </div>
          );
        })}
      </div>
      {showAdd && (
        <div className="modal-backdrop" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowAdd(false)}><X size={18} /></button>
            <div className="modal-icon"><Plus size={22} /></div>
            <h2>Add a child</h2>
            <p>Tell us a little about your child to add them to your family dashboard.</p>
            <div className="add-modal-form">
              <label>Child's full name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Charlie Smith" /></label>
              <label>Year level
                <select value={form.year} onChange={e => setForm({ ...form, year: e.target.value })}>
                  {['Year 1','Year 2','Year 3','Year 4','Year 5','Year 6'].map(y => <option key={y}>{y}</option>)}
                </select>
              </label>
              <label>School<input value={form.school} onChange={e => setForm({ ...form, school: e.target.value })} placeholder="e.g. Example Primary School" /></label>
            </div>
            <Button onClick={handleAdd} icon={Check}>Add child</Button>
            <button className="modal-cancel" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
