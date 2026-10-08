import { Check, ChevronRight, Mail, Plus, Search, Users, X } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { dataClient } from '../../../lib/data/client';
import { computeGatingState } from '../../../lib/utils/termUtils';
import { TERM_BASE_PRICE, REGISTRATION_FEE, GST_RATE, TERM_CREDITS } from '../../../lib/config';
import type { TermGatingState } from '../../../types/term';

const TERM_TOTAL = Math.round((TERM_BASE_PRICE + REGISTRATION_FEE) * (1 + GST_RATE));
const colours = ['pink', 'yellow', 'teal', 'orange', 'green', 'magenta'];

const FAMILY_NAMES: Record<string, string> = {
  f1: 'Sarah Johnson', f2: 'Claire Brown', f3: 'James Taylor', f4: 'Michael Chen',
};
const FAMILY_EMAILS: Record<string, string> = {
  f1: 'sarah.johnson@email.com', f2: 'claire.b@email.com', f3: 'james.t@email.com', f4: 'm.chen@email.com',
};
const FAMILY_PHONES: Record<string, string> = {
  f1: '0401 234 567', f2: '0402 345 678', f3: '0403 456 789', f4: '0404 567 890',
};

const gatingLabel: Record<TermGatingState, string> = {
  NO_TERM_EVER: 'No term', ACTIVE_TERM: 'Active term', TERM_EXPIRED: 'Term expired',
};
const gatingClass: Record<TermGatingState, string> = {
  NO_TERM_EVER: 'pending', ACTIVE_TERM: 'confirmed', TERM_EXPIRED: 'failed',
};

export function AdminParentsPage() {
  const [search, setSearch] = useState('');
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', child: '' });

  const { data: families = [], isLoading } = useQuery({
    queryKey: ['allFamilies'],
    queryFn: () => dataClient.getAllFamilies(),
  });

  // Fetch children + terms for all families
  const ALL_IDS = families.map(f => f.id);

  const { data: allChildren = [] } = useQuery({
    queryKey: ['allChildren', ALL_IDS.join(',')],
    queryFn: async () => (await Promise.all(ALL_IDS.map(id => dataClient.getChildren(id)))).flat(),
    enabled: ALL_IDS.length > 0,
  });

  const { data: allTermsMap = {} } = useQuery({
    queryKey: ['allTerms', ALL_IDS.join(',')],
    queryFn: async () => {
      const entries = await Promise.all(ALL_IDS.map(async id => [id, await dataClient.getTerms(id)] as const));
      return Object.fromEntries(entries);
    },
    enabled: ALL_IDS.length > 0,
  });

  const rows = families.map((f, i) => {
    const name = FAMILY_NAMES[f.id] ?? f.id;
    const terms = allTermsMap[f.id] ?? [];
    const gatingState = computeGatingState(terms);
    const activeTerm = terms.find(t => new Date(t.end_date) > new Date());
    const creditsRemaining = activeTerm?.classes_remaining ?? 0;
    const children = allChildren.filter(c => c.family_id === f.id);
    const latestPayment = terms[terms.length - 1]?.payment;
    const paymentStatus = latestPayment?.status ?? 'none';
    return { familyId: f.id, name, email: FAMILY_EMAILS[f.id] ?? '—', phone: FAMILY_PHONES[f.id] ?? '—', children, gatingState, creditsRemaining, paymentStatus, color: colours[i % colours.length] };
  });

  const filtered = rows.filter(r => r.name.toLowerCase().includes(search.toLowerCase()) || r.email.toLowerCase().includes(search.toLowerCase()));
  const detail = selectedFamilyId ? rows.find(r => r.familyId === selectedFamilyId) ?? null : null;

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div><h2>{families.length} parent accounts</h2><p>Families connected to Fairybread &amp; Fractions.</p></div>
        <div className="toolbar-actions">
          <div className="search-box">
            <Search size={16} />
            <input placeholder="Search parents" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button icon={Plus} onClick={() => setShowAdd(true)}>Add parent</Button>
        </div>
      </div>

      <div className="card table-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>{['Family', 'Children', 'Contact', 'Term status', 'Credits left', 'Payment', ''].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Loading…</td></tr>
              )}
              {filtered.map(p => (
                <tr key={p.familyId} className="row-clickable" onClick={() => setSelectedFamilyId(p.familyId)}>
                  <td><strong className="table-name">{p.name}</strong></td>
                  <td>{p.children.map(c => c.name.split(' ')[0]).join(', ') || '—'}</td>
                  <td>{p.email}</td>
                  <td><span className={`table-status ${gatingClass[p.gatingState]}`}>{gatingLabel[p.gatingState]}</span></td>
                  <td>{p.gatingState === 'ACTIVE_TERM' ? `${p.creditsRemaining} / ${TERM_CREDITS}` : '—'}</td>
                  <td>
                    <span className={`table-status ${p.paymentStatus === 'paid' ? 'confirmed' : p.paymentStatus === 'pending' ? 'pending' : p.paymentStatus === 'none' ? '' : 'failed'}`}>
                      {p.paymentStatus === 'none' ? '—' : p.paymentStatus.charAt(0).toUpperCase() + p.paymentStatus.slice(1)}
                    </span>
                  </td>
                  <td><ChevronRight size={16} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="modal-backdrop" onClick={() => setSelectedFamilyId(null)}>
          <div className="modal parent-detail-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedFamilyId(null)}><X size={18} /></button>
            <div className="parent-detail-head">
              <div className={`mini-avatar ${detail.color}-bg`}>{detail.name.split(' ').map(x => x[0]).join('')}</div>
              <div><strong>{detail.name}</strong><span>{detail.email}</span></div>
            </div>
            <div className="parent-detail-body">
              <div className="review-detail-row"><span>Phone</span><b>{detail.phone}</b></div>
              <div className="review-detail-row"><span>Children</span><b>{detail.children.map(c => c.name).join(', ') || '—'}</b></div>
              <div className="review-detail-row"><span>Term status</span><span className={`table-status ${gatingClass[detail.gatingState]}`}>{gatingLabel[detail.gatingState]}</span></div>
              <div className="review-detail-row">
                <span>Credits remaining</span>
                <b>{detail.gatingState === 'ACTIVE_TERM' ? `${detail.creditsRemaining} of ${TERM_CREDITS} (shared across all children)` : '—'}</b>
              </div>
              <div className="review-detail-row"><span>Term fee</span><b>${TERM_TOTAL} AUD (incl. GST)</b></div>
              <div className="review-detail-row">
                <span>Payment status</span>
                <span className={`table-status ${detail.paymentStatus === 'paid' ? 'confirmed' : detail.paymentStatus === 'pending' ? 'pending' : ''}`}>
                  {detail.paymentStatus === 'none' ? '—' : detail.paymentStatus.charAt(0).toUpperCase() + detail.paymentStatus.slice(1)}
                </span>
              </div>
            </div>
            <div className="review-actions">
              <Button variant="ghost" onClick={() => setSelectedFamilyId(null)} icon={X}>Close</Button>
              <Button onClick={() => setSelectedFamilyId(null)} icon={Mail}>Send message</Button>
            </div>
          </div>
        </div>
      )}

      {/* Add parent modal (UI only — no backend mutation yet) */}
      {showAdd && (
        <div className="modal-backdrop" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowAdd(false)}><X size={18} /></button>
            <div className="modal-icon"><Users size={22} /></div>
            <h2>Add parent</h2>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>Parent accounts are created via the Supabase auth system. This form will be wired to the backend when auth is implemented.</p>
            <div className="add-modal-form">
              <label>Parent name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Rebecca Martin" /></label>
              <label>Email<input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="e.g. rebecca@email.com" /></label>
              <label>Phone<input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="e.g. 0400 123 456" /></label>
              <label>Linked child<input value={form.child} onChange={e => setForm({ ...form, child: e.target.value })} placeholder="e.g. Charlotte Martin" /></label>
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
