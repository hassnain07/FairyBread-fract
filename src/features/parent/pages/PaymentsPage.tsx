import { ArrowRight, Check, CircleDollarSign, Clock3, FileText, Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { useAuth } from '../../../app/providers';
import { useBookingEligibility } from '../hooks/useBookingEligibility';
import { dataClient } from '../../../lib/data/client';
import { qk } from '../../../lib/data/queryKeys';
import { formatMoney } from '../../../lib/utils/money';
import { toAppError } from '../../../lib/data/errors';
import { ProofUpload, validateProof } from '../../payments/ProofUpload';
import type { Payment, PaymentIntent } from '../../../types/payment';

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: Payment['status'] }) {
  const map: Record<string, string> = { paid: 'confirmed', pending: 'pending', failed: 'failed', rejected: 'failed' };
  const label: Record<string, string> = { paid: 'Verified', pending: 'Pending', failed: 'Failed', rejected: 'Rejected' };
  return (
    <span className={`table-status ${map[status] ?? ''}`}>
      {status === 'paid' && <Check size={11} style={{ marginRight: 3 }} />}
      {status === 'pending' && <Clock3 size={11} style={{ marginRight: 3 }} />}
      {label[status] ?? status}
    </span>
  );
}

// ── Payment row card ──────────────────────────────────────────────────────────
function PaymentCard({ payment, onView }: { payment: Payment; onView: (p: Payment) => void }) {
  const isClass = payment.type === 'individual_class';
  const isAssessment = payment.type === 'assessment';
  const date = new Date(payment.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  const color = isClass ? 'var(--teal)' : isAssessment ? 'var(--yellow)' : 'var(--pink)';
  const bg = isClass ? 'var(--teal-soft)' : isAssessment ? 'var(--yellow-soft)' : 'var(--pink-soft)';

  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', padding: '18px 22px' }} onClick={() => onView(payment)}>
      <div style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, background: bg, color, display: 'grid', placeItems: 'center' }}>
        <CircleDollarSign size={20} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ fontSize: 13, display: 'block' }}>
          {isClass
            ? `${payment.details.subject ?? 'Individual class'} — ${payment.details.child_name ?? ''}`
            : isAssessment
            ? `Assessment — ${payment.details.child_name ?? ''}`
            : `Term payment${payment.term_label ? ` · ${payment.term_label}` : ''}`}
        </strong>
        <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, display: 'block' }}>
          {payment.reference} · {date}
        </span>
        {payment.review_note && payment.status === 'rejected' && (
          <span style={{ fontSize: 11, color: 'var(--orange)' }}>Rejected: {payment.review_note}</span>
        )}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <strong style={{ fontSize: 16, display: 'block' }}>{formatMoney(payment.total_cents)}</strong>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>AUD</span>
      </div>
      <StatusBadge status={payment.status} />
    </div>
  );
}

// ── Detail modal ──────────────────────────────────────────────────────────────
function PaymentDetailModal({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  const isClass = payment.type === 'individual_class';
  const isAssessment = payment.type === 'assessment';
  const date = new Date(payment.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420, textAlign: 'left' }} onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
        <div className="modal-icon"><CircleDollarSign size={22} /></div>
        <h2 style={{ textAlign: 'center', fontSize: 20 }}>
          {isClass ? 'Individual class payment' : isAssessment ? 'Assessment payment' : 'Term payment'}
        </h2>
        <div className="review-details" style={{ marginTop: 16 }}>
          {(isClass || isAssessment) && payment.details.child_name && (
            <div className="review-detail-row"><span>Child</span><b>{payment.details.child_name}</b></div>
          )}
          {isClass && (<>
            {payment.details.subject && <div className="review-detail-row"><span>Subject</span><b>{payment.details.subject}</b></div>}
            {payment.details.day && <div className="review-detail-row"><span>Day</span><b>{payment.details.day}</b></div>}
            {payment.details.time && <div className="review-detail-row"><span>Time</span><b>{payment.details.time}</b></div>}
            {payment.details.tutor && <div className="review-detail-row"><span>Tutor</span><b>{payment.details.tutor}</b></div>}
          </>)}
          {!isClass && !isAssessment && payment.term_label && (
            <div className="review-detail-row"><span>Term</span><b>{payment.term_label}</b></div>
          )}
          <div className="review-detail-row"><span>Reference</span><b><code style={{ fontSize: 11 }}>{payment.reference}</code></b></div>
          <div className="review-detail-row"><span>Date submitted</span><b>{date}</b></div>
          <div className="review-detail-row"><span>Amount</span><b>{formatMoney(payment.amount_cents)}</b></div>
          <div className="review-detail-row"><span>GST</span><b>{formatMoney(payment.gst_cents)}</b></div>
          <div className="review-detail-row"><span>Total</span><b style={{ fontSize: 15 }}>{formatMoney(payment.total_cents)} AUD</b></div>
          <div className="review-detail-row"><span>Status</span><StatusBadge status={payment.status} /></div>
          {payment.proof_filename && (
            <div className="review-detail-row">
              <span>Receipt</span>
              <b style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--teal)', fontSize: 12 }}>
                <FileText size={13} />{payment.proof_filename}
              </b>
            </div>
          )}
          {payment.review_note && payment.status === 'rejected' && (
            <div className="review-detail-row"><span>Rejection note</span><b style={{ color: 'var(--orange)' }}>{payment.review_note}</b></div>
          )}
        </div>
        {payment.status === 'pending' && (
          <div className="pending-verify-note" style={{ marginTop: 16 }}>
            <Clock3 size={16} />
            <span>Your payment is being reviewed. We'll notify you once it's verified — usually within 1–2 business days.</span>
          </div>
        )}
        <div style={{ marginTop: 20 }}>
          <Button variant="soft" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

// ── Purchase panel (term or individual class) ─────────────────────────────────
function PurchasePanel({
  intent, onDone, onCancel,
}: { intent: PaymentIntent; onDone: () => void; onCancel: () => void }) {
  const qc = useQueryClient();
  const { familyId } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const idRef = useRef(crypto.randomUUID());

  const { data: quote } = useQuery({
    queryKey: qk.quote(intent.type, familyId),
    queryFn: () => dataClient.getPriceQuote!(intent.type, familyId),
    enabled: !!familyId,
  });

  const { data: settings = {} } = useQuery({
    queryKey: qk.settings,
    queryFn: () => dataClient.getSettings(),
  });

  const { data: family } = useQuery({
    queryKey: qk.family(familyId),
    queryFn: () => dataClient.getFamily(familyId),
    enabled: !!familyId,
  });

  const bank = (settings as any)?.public_info?.bank ?? {};
  const refCode = family?.reference_code ?? familyId;
  const suffix = intent.type === 'term' ? 'TERM' : intent.type === 'individual_class' ? 'CLASS' : 'ASSESS';
  const reference = `${refCode}-${suffix}`;

  const { mutate: submit, isPending } = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('proof_missing');
      return dataClient.submitPayment!(intent, file);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.payments(familyId) });
      qc.invalidateQueries({ queryKey: qk.allPayments });
      qc.invalidateQueries({ queryKey: qk.terms(familyId) });
      qc.invalidateQueries({ queryKey: qk.assessments(familyId) });
      onDone();
    },
    onError: (e) => setSubmitError(toAppError(e).message),
  });

  function handleFileChange(f: File | null) {
    setFile(f);
    setFileError('');
    if (f) {
      const err = validateProof(f);
      if (err) { setFileError(err); setFile(null); }
    }
  }

  function handleSubmit() {
    if (!file) { setFileError('Please attach your proof of payment.'); return; }
    const err = validateProof(file);
    if (err) { setFileError(err); return; }
    submit();
  }

  const typeLabel = intent.type === 'term' ? 'Term payment' : intent.type === 'individual_class' ? 'Individual class' : 'Assessment';

  return (
    <div className="card invoice">
      <div className="invoice-head" style={{ marginBottom: 16 }}>
        <div><span className="label">{typeLabel}</span><h3>{intent.type === 'term' ? '10-week term package' : 'Class payment'}</h3></div>
        <button style={{ background: 'none', color: 'var(--muted)', cursor: 'pointer' }} onClick={onCancel}><X size={18} /></button>
      </div>

      {step === 1 && quote && (
        <>
          {intent.type === 'term' && (
            <>
              <div className="invoice-line"><span>10-week term</span><b>{formatMoney(quote.base_cents)}</b></div>
              {quote.registration_cents > 0 && <div className="invoice-line"><span>Registration fee</span><b>{formatMoney(quote.registration_cents)}</b></div>}
            </>
          )}
          {intent.type !== 'term' && (
            <div className="invoice-line"><span>Class fee</span><b>{formatMoney(quote.amount_cents)}</b></div>
          )}
          <div className="divider" />
          <div className="invoice-line"><span>Subtotal</span><b>{formatMoney(quote.amount_cents)}</b></div>
          <div className="invoice-line"><span>GST (10%)</span><b>{formatMoney(quote.gst_cents)}</b></div>
          <div className="divider" />
          <div className="invoice-line total"><span>Total due</span><b>{formatMoney(quote.total_cents)} AUD</b></div>
          <div className="bank-details-card" style={{ marginTop: 16 }}>
            <div className="bank-details-head"><CircleDollarSign size={18} /><span>Bank transfer details</span></div>
            <div className="bank-detail-row"><span>Account name</span><b>{bank.account_name ?? '—'}</b></div>
            <div className="bank-detail-row"><span>BSB</span><b>{bank.bsb ?? '—'}</b></div>
            <div className="bank-detail-row"><span>Account number</span><b>{bank.account ?? '—'}</b></div>
            <div className="bank-detail-row"><span>Reference</span><b>{reference}</b></div>
          </div>
          <div className="invoice-actions">
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button onClick={() => setStep(2)} icon={Check}>I've made this payment</Button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <span className="label">Upload proof of payment</span>
          <h3 style={{ margin: '6px 0 14px' }}>Share your receipt</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
            Upload a screenshot or PDF of your bank transfer confirmation.
          </p>
          <ProofUpload file={file} onChange={handleFileChange} error={fileError} />
          {submitError && <p className="auth-error" style={{ marginTop: 8 }}>{submitError}</p>}
          <div className="form-actions" style={{ marginTop: 16 }}>
            <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
            <Button disabled={!file || isPending} onClick={handleSubmit} icon={ArrowRight}>
              {isPending ? 'Submitting…' : 'Submit proof'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function PaymentsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { familyId } = useAuth();
  const { gatingState, activeTerm, isLoading: eligibilityLoading } = useBookingEligibility(familyId);

  const locationState = location.state as { type?: string; childId?: string; sessionId?: string } | null;
  const incomingIndividual = locationState?.type === 'individual' && locationState.childId && locationState.sessionId;

  const [activeIntent, setActiveIntent] = useState<PaymentIntent | null>(
    incomingIndividual
      ? { type: 'individual_class', familyId, childId: locationState!.childId!, sessionId: locationState!.sessionId! }
      : null
  );
  const [viewingPayment, setViewingPayment] = useState<Payment | null>(null);

  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: qk.payments(familyId),
    queryFn: () => dataClient.getPayments(familyId),
    enabled: !!familyId,
  });

  const sorted = [...payments].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const paidTotal = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.total_cents, 0);
  const pendingCount = payments.filter(p => p.status === 'pending').length;

  function handleFlowDone() {
    setActiveIntent(null);
    navigate('/parent/payments', { replace: true });
  }

  if (eligibilityLoading || paymentsLoading) return <div className="page-stack"><p>Loading…</p></div>;

  return (
    <div className="page-stack">
      <div className="payment-highlight">
        <div>
          <span className="label">Payment history</span>
          <h2>Simple, clear and all in one place.</h2>
          <p>
            {payments.length === 0
              ? 'No payments yet. Purchase a term to get started.'
              : `${payments.length} payment${payments.length !== 1 ? 's' : ''} on record${pendingCount > 0 ? ` · ${pendingCount} pending verification` : ''}.`}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div className="payment-total">
            <span>TOTAL PAID</span>
            <strong>{formatMoney(paidTotal)}</strong>
            <small>AUD · verified</small>
          </div>
          {gatingState !== 'ACTIVE_TERM' && !activeIntent && (
            <Button icon={Plus} onClick={() => setActiveIntent({ type: 'term', familyId })}>
              {gatingState === 'TERM_EXPIRED' ? 'Renew term' : 'Purchase term'}
            </Button>
          )}
        </div>
      </div>

      {activeTerm && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 22px' }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--teal-soft)', color: 'var(--teal)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Check size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: 13, display: 'block' }}>Active term</strong>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              {activeTerm.term_label ?? 'Active term'} · ends {new Date(activeTerm.end_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
          <Button variant="soft" onClick={() => navigate('/parent/book-class')} icon={ArrowRight}>Book a class</Button>
        </div>
      )}

      {activeIntent && (
        <PurchasePanel
          intent={activeIntent}
          onDone={handleFlowDone}
          onCancel={() => { setActiveIntent(null); navigate('/parent/payments', { replace: true }); }}
        />
      )}

      {!activeIntent && (
        <>
          {sorted.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
              <CircleDollarSign size={32} style={{ color: 'var(--muted)', margin: '0 auto 12px', display: 'block' }} />
              <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>No payments on record yet.</p>
              <Button icon={Plus} onClick={() => setActiveIntent({ type: 'term', familyId })}>Purchase a term</Button>
            </div>
          ) : (
            <>
              {sorted.filter(p => p.status === 'pending').length > 0 && (
                <div>
                  <p className="label" style={{ marginBottom: 10 }}>Awaiting verification</p>
                  {sorted.filter(p => p.status === 'pending').map(p => (
                    <PaymentCard key={p.id} payment={p} onView={setViewingPayment} />
                  ))}
                </div>
              )}
              {sorted.filter(p => p.status !== 'pending').length > 0 && (
                <div>
                  <p className="label" style={{ marginBottom: 10 }}>Payment history</p>
                  {sorted.filter(p => p.status !== 'pending').map(p => (
                    <PaymentCard key={p.id} payment={p} onView={setViewingPayment} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {viewingPayment && (
        <PaymentDetailModal payment={viewingPayment} onClose={() => setViewingPayment(null)} />
      )}
    </div>
  );
}
