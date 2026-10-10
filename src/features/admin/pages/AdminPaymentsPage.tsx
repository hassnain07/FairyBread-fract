import { Check, CircleDollarSign, Clock3, ExternalLink, Search, X } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { TableControls } from '../../../components/ui/TableControls';
import { usePagination, useSearch } from '../../../hooks/usePagination';
import { dataClient } from '../../../lib/data/client';
import { qk } from '../../../lib/data/queryKeys';
import { formatMoney } from '../../../lib/utils/money';
import { toAppError } from '../../../lib/data/errors';
import type { Payment } from '../../../types/payment';

function Stat({ label, value, accent, icon: Icon }: { label: string; value: string; accent: string; icon: React.ElementType }) {
  return (
    <div className={`stat-card accent-${accent}`}>
      <div className="stat-icon"><Icon size={19} /></div>
      <strong>{value}</strong><span>{label}</span><div className="stat-line" />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = { paid: 'confirmed', pending: 'pending', failed: 'review', rejected: 'review' };
  return <span className={`table-status ${map[status] ?? ''}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
}

export function AdminPaymentsPage() {
  const qc = useQueryClient();
  const [reviewing, setReviewing] = useState<Payment | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending');
  const [rejectNote, setRejectNote] = useState('');
  const [actionError, setActionError] = useState('');
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [loadingProof, setLoadingProof] = useState(false);
  const [proofError, setProofError] = useState(false);

  const { data: allPayments = [], isLoading } = useQuery({
    queryKey: qk.allPayments,
    queryFn: () => dataClient.getAllPayments!(),
  });

  const pendingPayments = allPayments.filter(p => p.status === 'pending');
  const tabRows = activeTab === 'pending' ? pendingPayments : allPayments;

  const { search, onSearch } = useSearch(() => onPage(1));
  const searchFiltered = tabRows.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (p.family_name ?? '').toLowerCase().includes(q) || p.reference.toLowerCase().includes(q);
  });
  const { page, totalPages, paged: displayRows, onPage, total } = usePagination(searchFiltered);

  const paidTotal = allPayments.filter(p => p.status === 'paid').reduce((s, p) => s + p.total_cents, 0);
  const pendingTotal = allPayments.filter(p => p.status === 'pending').reduce((s, p) => s + p.total_cents, 0);
  const rejectedTotal = allPayments.filter(p => p.status === 'rejected' || p.status === 'failed').reduce((s, p) => s + p.total_cents, 0);

  const { mutate: verify, isPending: verifying } = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: 'approve' | 'reject'; note?: string }) =>
      dataClient.verifyPayment!(id, action, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.allPayments });
      qc.invalidateQueries({ queryKey: qk.allTerms });
      qc.invalidateQueries({ queryKey: qk.adminStats });
      setReviewing(null);
      setRejectNote('');
      setProofUrl(null);
      setActionError('');
    },
    onError: (e) => setActionError(toAppError(e).message),
  });

  async function openReview(p: Payment) {
    setReviewing(p);
    setRejectNote('');
    setActionError('');
    setProofUrl(null);
    setProofError(false);
    setLoadingProof(true);
    try {
      const url = await dataClient.getProofUrl!(p.id);
      setProofUrl(url);
    } catch {
      setProofError(true);
    } finally {
      setLoadingProof(false);
    }
  }

  function handleApprove() {
    if (!reviewing) return;
    verify({ id: reviewing.id, action: 'approve' });
  }

  function handleReject() {
    if (!reviewing) return;
    if (!rejectNote.trim()) { setActionError('A rejection note is required.'); return; }
    verify({ id: reviewing.id, action: 'reject', note: rejectNote.trim() });
  }

  return (
    <div className="page-stack">
      <div className="admin-payment-stats">
        <Stat label="Paid this term" value={formatMoney(paidTotal)} accent="teal" icon={Check} />
        <Stat label="Pending verification" value={formatMoney(pendingTotal)} accent="yellow" icon={Clock3} />
        <Stat label="Rejected / Failed" value={formatMoney(rejectedTotal)} accent="orange" icon={X} />
      </div>

      <div className="card table-card">
        <div className="card-heading table-heading">
          <div>
            <span className="label">Payments</span>
            <h3>Payment verification</h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              Review proof of payment submitted by families and approve or reject.
            </p>
          </div>
        </div>

        <TableControls search={search} onSearch={onSearch} page={page} totalPages={totalPages} total={total} onPage={onPage} placeholder="Search by family or reference…">
          <div className="table-filters" style={{ border: 'none', padding: 0 }}>
            <button className={activeTab === 'pending' ? 'filter-active' : ''} onClick={() => { setActiveTab('pending'); onSearch(''); }}>
              Pending review <span>{pendingPayments.length}</span>
            </button>
            <button className={activeTab === 'all' ? 'filter-active' : ''} onClick={() => { setActiveTab('all'); onSearch(''); }}>
              All payments <span>{allPayments.length}</span>
            </button>
          </div>
        </TableControls>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>{['Family', 'Type', 'Details', 'Reference', 'Amount', 'Date', 'Status', ''].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Loading…</td></tr>}
              {!isLoading && displayRows.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>
                  {activeTab === 'pending' ? 'No payments pending verification.' : 'No payments found.'}
                </td></tr>
              )}
              {displayRows.map(p => (
                <tr key={p.id} className={p.status === 'pending' ? 'row-clickable' : ''} onClick={p.status === 'pending' ? () => openReview(p) : undefined}>
                  <td><strong className="table-name">{p.family_name ?? p.family_id}</strong></td>
                  <td>
                    <span className={`table-status ${p.type === 'term' ? 'confirmed' : 'view'}`}>
                      {p.type === 'term' ? 'Term' : p.type === 'assessment' ? 'Assessment' : 'Individual'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--ink)', maxWidth: 180, whiteSpace: 'normal', lineHeight: 1.4 }}>
                    {p.type === 'term'
                      ? (p.term_label ?? 'Term payment')
                      : `${p.details.subject ?? p.type} · ${p.details.child_name ?? ''}`}
                  </td>
                  <td><code style={{ fontSize: 10, background: '#f4f7f3', padding: '2px 6px', borderRadius: 4 }}>{p.reference}</code></td>
                  <td><strong>{formatMoney(p.total_cents)}</strong></td>
                  <td style={{ fontSize: 11 }}>{new Date(p.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td>
                    {p.status === 'pending' && (
                      <button className="btn-view-profile" onClick={e => { e.stopPropagation(); openReview(p); }}>Review</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {reviewing && (
        <div className="modal-backdrop" onClick={() => { setReviewing(null); setProofUrl(null); setProofError(false); }}>
          <div className="modal payment-review-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => { setReviewing(null); setProofUrl(null); setProofError(false); }}><X size={18} /></button>
            <div className="modal-icon payment"><CircleDollarSign size={22} /></div>
            <h2>Verify payment</h2>
            <p>Review the submitted proof and approve or reject this payment.</p>

            <div className="receipt-preview">
              {loadingProof ? (
                <div className="receipt-placeholder"><p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading proof…</p></div>
              ) : proofUrl ? (
                <div className="receipt-placeholder receipt-has-file">
                  <a href={proofUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--teal)', fontWeight: 600, fontSize: 13 }}>
                    <ExternalLink size={16} /> View proof — {reviewing.proof_filename ?? 'receipt'}
                  </a>
                </div>
              ) : proofError ? (
                <div className="receipt-placeholder">
                  <p style={{ color: 'var(--orange)', fontSize: 13 }}>Could not load proof — it may have been deleted from storage.</p>
                </div>
              ) : (
                <div className="receipt-placeholder">
                  <p style={{ color: 'var(--muted)', fontSize: 13 }}>No receipt uploaded</p>
                </div>
              )}
            </div>

            <div className="review-details">
              <div className="review-detail-row"><span>Family</span><b>{reviewing.family_name ?? reviewing.family_id}</b></div>
              <div className="review-detail-row"><span>Type</span><b>{reviewing.type === 'term' ? 'Term payment' : reviewing.type === 'assessment' ? 'Assessment' : 'Individual class'}</b></div>
              {reviewing.type === 'term' && reviewing.term_label && (
                <div className="review-detail-row"><span>Term</span><b>{reviewing.term_label}</b></div>
              )}
              {reviewing.type !== 'term' && reviewing.details.child_name && (
                <div className="review-detail-row"><span>Child</span><b>{reviewing.details.child_name}</b></div>
              )}
              {reviewing.type === 'individual_class' && (<>
                {reviewing.details.subject && <div className="review-detail-row"><span>Class</span><b>{reviewing.details.subject}{reviewing.details.day ? ` · ${reviewing.details.day}` : ''}{reviewing.details.time ? ` ${reviewing.details.time}` : ''}</b></div>}
                {reviewing.details.tutor && <div className="review-detail-row"><span>Tutor</span><b>{reviewing.details.tutor}</b></div>}
              </>)}
              <div className="review-detail-row"><span>Reference</span><b><code style={{ fontSize: 11 }}>{reviewing.reference}</code></b></div>
              <div className="review-detail-row"><span>Amount</span><b>{formatMoney(reviewing.amount_cents)} + {formatMoney(reviewing.gst_cents)} GST = {formatMoney(reviewing.total_cents)} AUD</b></div>
              {reviewing.type === 'term' && (
                <div className="review-detail-row"><span>Credits</span><b>10 class credits unlocked on approval</b></div>
              )}
            </div>

            <div style={{ marginTop: 16 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                Rejection note <span style={{ color: 'var(--orange)' }}>(required to reject)</span>
              </label>
              <textarea
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                placeholder="e.g. Reference number doesn't match, please resubmit with the correct reference."
                rows={3}
                style={{ width: '100%', borderRadius: 8, border: '1px solid var(--line)', padding: '8px 12px', fontSize: 13, resize: 'vertical' }}
              />
            </div>

            {actionError && <p className="auth-error" style={{ marginTop: 8 }}>{actionError}</p>}

            <div className="review-actions">
              <Button variant="ghost" icon={X} onClick={handleReject} disabled={verifying}>Reject</Button>
              <Button icon={Check} onClick={handleApprove} disabled={verifying}>
                {verifying ? 'Saving…' : 'Approve payment'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
