import { Check, CircleDollarSign, Clock3, Download, FileText, X, Image } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { dataClient } from '../../../lib/data/client';
import type { Payment } from '../../../types/payment';
import { TERM_CREDITS } from '../../../lib/config';

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

  const { data: pendingPayments = [], isLoading: loadingPending } = useQuery({
    queryKey: ['pendingPayments'],
    queryFn: () => dataClient.getPendingPayments(),
  });

  // Fetch all payments across all families for the "All payments" tab
  const ALL_FAMILY_IDS = ['f1', 'f2', 'f3', 'f4'];
  const { data: allPayments = [], isLoading: loadingAll } = useQuery({
    queryKey: ['allPayments'],
    queryFn: async () => (await Promise.all(ALL_FAMILY_IDS.map(id => dataClient.getPayments(id)))).flat(),
  });

  const { mutate: verify, isPending: verifying } = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      dataClient.verifyPayment(id, action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pendingPayments'] });
      qc.invalidateQueries({ queryKey: ['allPayments'] });
      setReviewing(null);
    },
  });

  const paidTotal = allPayments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount + p.gst, 0);
  const pendingTotal = allPayments.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount + p.gst, 0);
  const rejectedTotal = allPayments.filter(p => p.status === 'rejected' || p.status === 'failed').reduce((s, p) => s + p.amount + p.gst, 0);

  const displayRows = activeTab === 'pending' ? pendingPayments : allPayments;
  const isLoading = activeTab === 'pending' ? loadingPending : loadingAll;

  return (
    <div className="page-stack">
      <div className="admin-payment-stats">
        <Stat label="Paid this term" value={`$${paidTotal.toLocaleString()}`} accent="teal" icon={Check} />
        <Stat label="Pending verification" value={`$${pendingTotal.toLocaleString()}`} accent="yellow" icon={Clock3} />
        <Stat label="Rejected / Failed" value={`$${rejectedTotal.toLocaleString()}`} accent="orange" icon={X} />
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
          <Button variant="soft" icon={Download}>Export</Button>
        </div>

        <div className="table-filters">
          <button
            className={activeTab === 'pending' ? 'filter-active' : ''}
            onClick={() => setActiveTab('pending')}
          >
            Pending review <span>{pendingPayments.length}</span>
          </button>
          <button
            className={activeTab === 'all' ? 'filter-active' : ''}
            onClick={() => setActiveTab('all')}
          >
            All payments <span>{allPayments.length}</span>
          </button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {['Family', 'Type', 'Details', 'Reference', 'Amount', 'Receipt', 'Date', 'Status', ''].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Loading…</td></tr>
              )}
              {!isLoading && displayRows.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>
                  {activeTab === 'pending' ? 'No payments pending verification.' : 'No payments found.'}
                </td></tr>
              )}
              {displayRows.map(p => (
                <tr key={p.id} className={p.status === 'pending' ? 'row-clickable' : ''} onClick={p.status === 'pending' ? () => setReviewing(p) : undefined}>
                  <td><strong className="table-name">{p.family_name ?? p.family_id}</strong></td>
                  <td>
                    <span className={`table-status ${p.type === 'term' ? 'confirmed' : 'view'}`}>
                      {p.type === 'term' ? 'Term' : 'Individual'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--ink)', maxWidth: 180, whiteSpace: 'normal', lineHeight: 1.4 }}>
                    {p.type === 'term'
                      ? (p.term_label ?? 'Term payment')
                      : `${p.class_subject} · ${p.child_name}`}
                  </td>
                  <td><code style={{ fontSize: 10, background: '#f4f7f3', padding: '2px 6px', borderRadius: 4 }}>{p.reference}</code></td>
                  <td><strong>${(p.amount + p.gst).toFixed(0)}</strong></td>
                  <td>
                    {p.receipt_filename
                      ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--teal)', fontSize: 11, fontWeight: 600 }}><Image size={13} />{p.receipt_filename}</span>
                      : <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>}
                  </td>
                  <td style={{ fontSize: 11 }}>{new Date(p.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td>
                    {p.status === 'pending' && (
                      <button className="btn-view-profile" onClick={e => { e.stopPropagation(); setReviewing(p); }}>
                        Review
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Verification modal */}
      {reviewing && (
        <div className="modal-backdrop" onClick={() => setReviewing(null)}>
          <div className="modal payment-review-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setReviewing(null)}><X size={18} /></button>
            <div className="modal-icon payment"><CircleDollarSign size={22} /></div>
            <h2>Verify payment</h2>
            <p>Review the submitted proof and approve or reject this payment.</p>

            {/* Receipt preview */}
            <div className="receipt-preview">
              {reviewing.receipt_filename ? (
                <div className="receipt-placeholder receipt-has-file">
                  <Image size={36} />
                  <span>{reviewing.receipt_filename}</span>
                  <small>Submitted by {reviewing.family_name}</small>
                </div>
              ) : (
                <div className="receipt-placeholder">
                  <FileText size={36} />
                  <span>No receipt uploaded</span>
                  <small>Parent did not attach a file</small>
                </div>
              )}
            </div>

            {/* Payment details */}
            <div className="review-details">
              <div className="review-detail-row"><span>Family</span><b>{reviewing.family_name ?? reviewing.family_id}</b></div>
              <div className="review-detail-row"><span>Type</span><b>{reviewing.type === 'term' ? 'Term payment' : 'Individual class'}</b></div>
              {reviewing.type === 'term' && (
                <div className="review-detail-row"><span>Term</span><b>{reviewing.term_label ?? '—'}</b></div>
              )}
              {reviewing.type === 'individual_class' && (<>
                <div className="review-detail-row"><span>Child</span><b>{reviewing.child_name}</b></div>
                <div className="review-detail-row"><span>Class</span><b>{reviewing.class_subject} · {reviewing.class_day} {reviewing.class_time}</b></div>
                <div className="review-detail-row"><span>Tutor</span><b>{reviewing.class_tutor}</b></div>
              </>)}
              <div className="review-detail-row"><span>Reference</span><b><code style={{ fontSize: 11 }}>{reviewing.reference}</code></b></div>
              <div className="review-detail-row"><span>Amount</span><b>${reviewing.amount.toFixed(0)} + ${reviewing.gst.toFixed(0)} GST = ${(reviewing.amount + reviewing.gst).toFixed(0)} AUD</b></div>
              {reviewing.type === 'term' && (
                <div className="review-detail-row"><span>Credits</span><b>{TERM_CREDITS} class credits unlocked on approval</b></div>
              )}
            </div>

            <div className="review-actions">
              <Button variant="ghost" icon={X} onClick={() => verify({ id: reviewing.id, action: 'reject' })} disabled={verifying}>
                Reject
              </Button>
              <Button icon={Check} onClick={() => verify({ id: reviewing.id, action: 'approve' })} disabled={verifying}>
                {verifying ? 'Saving…' : 'Approve payment'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
