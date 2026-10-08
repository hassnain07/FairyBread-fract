import { BookOpen, Check, MoreHorizontal, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../components/ui/Button';

const colours = ['pink', 'yellow', 'teal', 'orange', 'green', 'magenta'];

export function AdminProgramsPage() {
  const [programs, setPrograms] = useState([
    { name: 'Mathematics', students: 24, color: 'pink', desc: 'Number sense, fractions, and problem-solving foundations.' },
    { name: 'English', students: 21, color: 'teal', desc: 'Reading comprehension, writing, and vocabulary.' },
    { name: 'Reading & Spelling', students: 15, color: 'orange', desc: 'Phonics, fluency, and word patterns for early readers.' },
  ]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', desc: '' });
  const save = () => {
    if (!form.name.trim()) return;
    setPrograms(p => [{ name: form.name, students: 0, color: colours[p.length % colours.length], desc: form.desc || 'New program.' }, ...p]);
    setForm({ name: '', desc: '' });
    setShowAdd(false);
  };
  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div><h2>{programs.length} active programs</h2><p>The subjects we offer and who is enrolled.</p></div>
        <Button icon={Plus} onClick={() => setShowAdd(true)}>Add program</Button>
      </div>
      <div className="program-admin-grid">
        {programs.map(p => (
          <div className="card program-admin-card" key={p.name}>
            <div className="program-admin-head">
              <div className={`program-icon ${p.color}-bg`}><BookOpen size={19} /></div>
              <div><strong>{p.name}</strong><span>{p.students} students enrolled</span></div>
              <MoreHorizontal size={18} />
            </div>
            <p>{p.desc}</p>
          </div>
        ))}
      </div>
      {showAdd && (
        <div className="modal-backdrop" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowAdd(false)}><X size={18} /></button>
            <div className="modal-icon"><BookOpen size={22} /></div>
            <h2>Add program</h2>
            <div className="add-modal-form">
              <label>Program name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Science" /></label>
              <label>Description<input value={form.desc} onChange={e => setForm({ ...form, desc: e.target.value })} placeholder="e.g. Hands-on science for curious minds" /></label>
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
