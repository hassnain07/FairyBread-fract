import { Check, ChevronRight, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { TableControls } from '../../../components/ui/TableControls';
import { usePagination, useSearch } from '../../../hooks/usePagination';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { dataClient } from '../../../lib/data/client';
import { qk } from '../../../lib/data/queryKeys';
import { toAppError } from '../../../lib/data/errors';
import type { TermGatingState } from '../../../types/term';

const colours = ['pink', 'yellow', 'teal', 'orange', 'green', 'magenta'];

const gatingLabel: Record<TermGatingState, string> = {
  NO_TERM_EVER: 'No term', ACTIVE_TERM: 'Active term', TERM_EXPIRED: 'Term expired',
};
const gatingClass: Record<TermGatingState, string> = {
  NO_TERM_EVER: 'pending', ACTIVE_TERM: 'confirmed', TERM_EXPIRED: 'failed',
};

export function AdminParentsPage() {
  const qc = useQueryClient();
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustError, setAdjustError] = useState('');

  const { data: families = [], isLoading } = useQuery({
    queryKey: qk.families,
    queryFn: () => dataClient.getAllFamilies(),
  });

  const { data: detailChildren = [] } = useQuery({
    queryKey: qk.children(selectedFamilyId ?? ''),
    queryFn: () => dataClient.getChildren(selectedFamilyId!),
    enabled: !!selectedFamilyId,
  });

  const { data: detailTerms = [] } = useQuery({
    queryKey: qk.terms(selectedFamilyId ?? ''),
    queryFn: () => dataClient.getTerms(selectedFamilyId!),
    enabled: !!selectedFamilyId,
  });

  const { data: detailPayments = [] } = useQuery({
    queryKey: qk.payments(selectedFamilyId ?? ''),
    queryFn: () => dataClient.getPayments(selectedFamilyId!),
    enabled: !!selectedFamilyId,
  });

  const { mutate: adjustCredits, isPending: adjusting } = useMutation({
    mutationFn: () => {
      const delta = parseInt(adjustDelta, 10);
      if (isNaN(delta) || delta === 0) throw new Error('invalid_input');
      if (!adjustNote.trim()) throw new Error('invalid_input');
      const activeTerm = detailTerms.find(t => new Date(t.end_date) > new Date());
      if (!activeTerm) throw new Error('invalid_input');
      return dataClient.adminAdjustCredits!(activeTerm.id, delta, adjustNote.trim());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.terms(selectedFamilyId ?? '') });
      qc.invalidateQueries({ queryKey: ['gating', selectedFamilyId] });
      setShowAdjust(false);
      setAdjustDelta('');
      setAdjustNote('');
      setAdjustError('');
    },
    onError: (e) => setAdjustError(toAppError(e).message),
  });

  // v_family_summary fields come through getAllFamilies — use what's available
  const rows = families.map((f, i) => {
    const gatingState: TermGatingState = (f as any).gating_state ?? 'NO_TERM_EVER';
    const creditsRemaining: number = (f as any).credits_remaining ?? 0;
    const lastPaymentStatus: string = (f as any).last_payment_status ?? 'none';
    const childCount: number = (f as any).child_count ?? f.children?.length ?? 0;
    return { ...f, gatingState, creditsRemaining, lastPaymentStatus, childCount, color: colours[i % colours.length] };
  });

  const { search, onSearch } = useSearch(() => onPage(1));

  const allFiltered = rows.filter(r =>
    r.parent_name.toLowerCase().includes(search.toLowerCase()) ||
    (r.email ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const { page, totalPages, paged, onPage, total } = usePagination(allFiltered);

  const detail = selectedFamilyId ? rows.find(r => r.id === selectedFamilyId) ?? null : null;
  const detailActiveTerm = detailTerms.find(t => new Date(t.end_date) > new Date());

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div><h2>{families.length} parent accounts</h2><p>Families connected to Fairybread &amp; Fractions.</p></div>
      </div>

      <div className="card table-card">
        <TableControls search={search} onSearch={onSearch} page={page} totalPages={totalPages} total={total} onPage={onPage} placeholder="Search parents…" />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>{['Family', 'Children', 'Contact', 'Term status', 'Credits', 'Last payment', ''].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Loading…</td></tr>}
              {paged.map(p => (
                <tr key={p.id} className="row-clickable" onClick={() => setSelectedFamilyId(p.id)}>
                  <td><strong className="table-name">{p.parent_name}</strong></td>
                  <td>{p.childCount}</td>
                  <td style={{ fontSize: 12 }}>{p.email ?? '—'}</td>
                  <td><span className={`table-status ${gatingClass[p.gatingState]}`}>{gatingLabel[p.gatingState]}</span></td>
                  <td>{p.gatingState === 'ACTIVE_TERM' ? `${p.creditsRemaining}` : '—'}</td>
                  <td>
                    {p.lastPaymentStatus !== 'none' && (
                      <span className={`table-status ${p.lastPaymentStatus === 'paid' ? 'confirmed' : p.lastPaymentStatus === 'pending' ? 'pending' : 'failed'}`}>
                        {p.lastPaymentStatus.charAt(0).toUpperCase() + p.lastPaymentStatus.slice(1)}
                      </span>
                    )}
                    {p.lastPaymentStatus === 'none' && '—'}
                  </td>
                  <td><ChevronRight size={16} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <div className="modal-backdrop" onClick={() => setSelectedFamilyId(null)}>
          <div className="modal parent-detail-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedFamilyId(null)}><X size={18} /></button>
            <div className="parent-detail-head">
              <div className={`mini-avatar ${detail.color}-bg`}>{detail.parent_name.split(' ').map(x => x[0]).join('')}</div>
              <div><strong>{detail.parent_name}</strong><span>{detail.email ?? '—'}</span></div>
            </div>
            <div className="parent-detail-body">
              {detail.phone && <div className="review-detail-row"><span>Phone</span><b>{detail.phone}</b></div>}
              <div className="review-detail-row"><span>Reference</span><b>{detail.reference_code}</b></div>
              <div className="review-detail-row">
                <span>Children</span>
                <b>{detailChildren.map(c => c.name).join(', ') || '—'}</b>
              </div>
              <div className="review-detail-row">
                <span>Term status</span>
                <span className={`table-status ${gatingClass[detail.gatingState]}`}>{gatingLabel[detail.gatingState]}</span>
              </div>
              {detailActiveTerm && (
                <div className="review-detail-row">
                  <span>Term</span>
                  <b>{detailActiveTerm.term_label ?? 'Active'} · ends {new Date(detailActiveTerm.end_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</b>
                </div>
              )}
              {detailPayments.length > 0 && (
                <div className="review-detail-row">
                  <span>Last payment</span>
                  <span className={`table-status ${detailPayments[0].status === 'paid' ? 'confirmed' : detailPayments[0].status === 'pending' ? 'pending' : 'failed'}`}>
                    {detailPayments[0].status.charAt(0).toUpperCase() + detailPayments[0].status.slice(1)}
                  </span>
                </div>
              )}
            </div>

            {!showAdjust && detailActiveTerm && (
              <div style={{ marginTop: 16 }}>
                <Button variant="soft" onClick={() => { setShowAdjust(true); setAdjustError(''); }}>Adjust credits</Button>
              </div>
            )}

            {showAdjust && detailActiveTerm && (
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span className="label">Adjust credits (note required)</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="number"
                    value={adjustDelta}
                    onChange={e => setAdjustDelta(e.target.value)}
                    placeholder="e.g. +2 or -1"
                    style={{ width: 100, borderRadius: 8, border: '1px solid var(--line)', padding: '8px 10px', fontSize: 13 }}
                  />
                  <input
                    value={adjustNote}
                    onChange={e => setAdjustNote(e.target.value)}
                    placeholder="Reason (required)"
                    style={{ flex: 1, borderRadius: 8, border: '1px solid var(--line)', padding: '8px 10px', fontSize: 13 }}
                  />
                </div>
                {adjustError && <p className="auth-error">{adjustError}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="ghost" onClick={() => setShowAdjust(false)}>Cancel</Button>
                  <Button icon={Check} onClick={() => adjustCredits()} disabled={adjusting || !adjustDelta || !adjustNote.trim()}>
                    {adjusting ? 'Saving…' : 'Apply'}
                  </Button>
                </div>
              </div>
            )}

            <div className="review-actions" style={{ marginTop: 16 }}>
              <Button variant="ghost" onClick={() => setSelectedFamilyId(null)} icon={X}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
