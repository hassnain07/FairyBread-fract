import { ArrowRight, Check, CircleDollarSign, Clock3, Download, FileText, Plus, Upload, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { useAuth } from '../../../app/providers';
import { useBookingEligibility } from '../hooks/useBookingEligibility';
import { dataClient } from '../../../lib/data/client';
import { TERM_BASE_PRICE, REGISTRATION_FEE, GST_RATE, TERM_CREDITS } from '../../../lib/config';
import type { Payment } from '../../../types/payment';

const subtotal = TERM_BASE_PRICE + REGISTRATION_FEE;
const termGst = Math.round(subtotal * GST_RATE);
const termTotal = subtotal + termGst;

const FAMILY_NAMES: Record<string, string> = {
  f1: 'Sarah Johnson', f2: 'Claire Brown', f3: 'James Taylor', f4: 'Michael Chen',
};

interface IndividualClassDetails {
  subject: string; day: string; time: string; tutor: string; child: string; amount: number;
}

type PurchaseFlow = 'term' | 'individual';

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
  const total = payment.amount + payment.gst;
  const date = new Date(payment.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div
      className="card"
      style={{ display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', padding: '18px 22px' }}
      onClick={() => onView(payment)}
    >
      <div
        style={{
          width: 42, height: 42, borderRadius: 12, flexShrink: 0,
          background: isClass ? 'var(--teal-soft)' : 'var(--pink-soft)',
          color: isClass ? 'var(--teal)' : 'var(--pink)',
          display: 'grid', placeItems: 'center',
        }}
      >
        <CircleDollarSign size={20} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ fontSize: 13, display: 'block' }}>
          {isClass
            ? `${payment.class_subject ?? 'Individual class'} — ${payment.child_name ?? ''}`
            : `Term payment${payment.term_label ? ` · ${payment.term_label}` : ''}`}
        </strong>
        <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, display: 'block' }}>
          {payment.reference} · {date}
        </span>
        {isClass && payment.class_day && (
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            {payment.class_day} · {payment.class_time} · {payment.class_tutor}
          </span>
        )}
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <strong style={{ fontSize: 16, display: 'block' }}>${total.toFixed(0)}</strong>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>AUD</span>
      </div>

      <StatusBadge status={payment.status} />
    </div>
  );
}

// ── Detail modal ──────────────────────────────────────────────────────────────
function PaymentDetailModal({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  const total = payment.amount + payment.gst;
  const isClass = payment.type === 'individual_class';
  const date = new Date(payment.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420, textAlign: 'left' }} onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
        <div className="modal-icon" style={{ background: isClass ? 'var(--teal-soft)' : 'var(--pink-soft)', color: isClass ? 'var(--teal)' : 'var(--pink)' }}>
          <CircleDollarSign size={22} />
        </div>
        <h2 style={{ textAlign: 'center', fontSize: 20 }}>
          {isClass ? 'Individual class payment' : 'Term payment'}
        </h2>

        <div className="review-details" style={{ marginTop: 16 }}>
          {isClass ? (
            <>
              <div className="review-detail-row"><span>Subject</span><b>{payment.class_subject}</b></div>
              <div className="review-detail-row"><span>Child</span><b>{payment.child_name}</b></div>
              <div className="review-detail-row"><span>Day</span><b>{payment.class_day}</b></div>
              <div className="review-detail-row"><span>Time</span><b>{payment.class_time}</b></div>
              <div className="review-detail-row"><span>Tutor</span><b>{payment.class_tutor}</b></div>
            </>
          ) : (
            <div className="review-detail-row"><span>Term</span><b>{payment.term_label ?? '—'}</b></div>
          )}
          <div className="review-detail-row"><span>Reference</span><b><code style={{ fontSize: 11 }}>{payment.reference}</code></b></div>
          <div className="review-detail-row"><span>Date submitted</span><b>{date}</b></div>
          <div className="review-detail-row"><span>Amount</span><b>${payment.amount.toFixed(0)}</b></div>
          <div className="review-detail-row"><span>GST (10%)</span><b>${payment.gst.toFixed(0)}</b></div>
          <div className="review-detail-row"><span>Total</span><b style={{ fontSize: 15 }}>${total.toFixed(0)} AUD</b></div>
          <div className="review-detail-row">
            <span>Status</span>
            <StatusBadge status={payment.status} />
          </div>
          {payment.receipt_filename && (
            <div className="review-detail-row">
              <span>Receipt</span>
              <b style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--teal)', fontSize: 12 }}>
                <FileText size={13} />{payment.receipt_filename}
              </b>
            </div>
          )}
        </div>

        {payment.status === 'pending' && (
          <div className="pending-verify-note" style={{ marginTop: 16 }}>
            <Clock3 size={16} />
            <span>Your payment is being reviewed. We'll notify you once it's verified — usually within 1–2 business days.</span>
          </div>
        )}

        <div style={{ marginTop: 20 }}>
          <Button variant="soft" icon={Download} onClick={onClose}>Download receipt</Button>
        </div>
      </div>
    </div>
  );
}

// ── Term purchase flow (inline panel) ────────────────────────────────────────
function TermPurchasePanel({
  familyId, familyName, onDone, onCancel,
}: { familyId: string; familyName: string; onDone: () => void; onCancel: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);

  const { mutate: submit, isPending } = useMutation({
    mutationFn: () => dataClient.submitPayment({
      family_id: familyId, family_name: familyName, type: 'term',
      amount: subtotal, gst: termGst, status: 'pending',
      reference: `TERM-${familyId.toUpperCase()}`,
      term_label: 'Term 3, 2025',
      receipt_filename: uploadedFile ?? undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments', familyId] });
      onDone();
    },
  });

  return (
    <div className="card invoice">
      <div className="invoice-head" style={{ marginBottom: 16 }}>
        <div><span className="label">New term payment</span><h3>10-week term package</h3></div>
        <button style={{ background: 'none', color: 'var(--muted)', cursor: 'pointer' }} onClick={onCancel}>
          <X size={18} />
        </button>
      </div>

      {step === 1 && (
        <>
          <div className="invoice-line"><span>10-week term ({TERM_CREDITS} class credits)</span><b>${TERM_BASE_PRICE}</b></div>
          <div className="invoice-line"><span>Registration fee</span><b>${REGISTRATION_FEE}</b></div>
          <div className="divider" />
          <div className="invoice-line"><span>Subtotal</span><b>${subtotal}</b></div>
          <div className="invoice-line"><span>GST (10%)</span><b>${termGst}</b></div>
          <div className="divider" />
          <div className="invoice-line total"><span>Total due</span><b>${termTotal}</b></div>
          <div className="bank-details-card" style={{ marginTop: 16 }}>
            <div className="bank-details-head"><CircleDollarSign size={18} /><span>Bank transfer details</span></div>
            <div className="bank-detail-row"><span>Account name</span><b>Fairybread &amp; Fractions Tutoring</b></div>
            <div className="bank-detail-row"><span>BSB</span><b>062 000</b></div>
            <div className="bank-detail-row"><span>Account number</span><b>1234 5678</b></div>
            <div className="bank-detail-row"><span>Reference</span><b>TERM-{familyId.toUpperCase()}</b></div>
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
          {!uploadedFile ? (
            <div className="upload-area" onClick={() => setUploadedFile('term-payment-receipt.jpg')}>
              <Upload size={28} /><strong>Drag &amp; drop or click to upload</strong><span>JPG, PNG or PDF · up to 10MB</span>
            </div>
          ) : (
            <div className="upload-attached">
              <div className="upload-file-info">
                <FileText size={20} />
                <div><strong>{uploadedFile}</strong><span>Attached · ready to submit</span></div>
                <Check size={18} className="teal-text" />
              </div>
              <button className="upload-remove" onClick={() => setUploadedFile(null)}>Remove file</button>
            </div>
          )}
          <div className="form-actions" style={{ marginTop: 16 }}>
            <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
            <Button disabled={!uploadedFile || isPending} onClick={() => submit()} icon={ArrowRight}>
              {isPending ? 'Submitting…' : 'Submit proof'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Individual class payment flow (inline panel) ──────────────────────────────
function IndividualPaymentPanel({
  familyId, familyName, classDetails, onDone, onCancel,
}: { familyId: string; familyName: string; classDetails: IndividualClassDetails; onDone: () => void; onCancel: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const classGst = Math.round(classDetails.amount * GST_RATE);
  const classTotal = classDetails.amount + classGst;

  const { mutate: submit, isPending } = useMutation({
    mutationFn: () => dataClient.submitPayment({
      family_id: familyId, family_name: familyName, type: 'individual_class',
      amount: classDetails.amount, gst: classGst, status: 'pending',
      reference: `CLASS-${classDetails.child.split(' ')[0].toUpperCase()}-${classDetails.subject.slice(0, 4).toUpperCase()}`,
      child_name: classDetails.child,
      class_subject: classDetails.subject, class_day: classDetails.day,
      class_time: classDetails.time, class_tutor: classDetails.tutor,
      receipt_filename: uploadedFile ?? undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments', familyId] });
      onDone();
    },
  });

  return (
    <div className="card invoice">
      <div className="invoice-head" style={{ marginBottom: 16 }}>
        <div>
          <span className="label">Individual class · {classDetails.child}</span>
          <h3>{classDetails.subject}</h3>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            {classDetails.day} · {classDetails.time} · {classDetails.tutor}
          </p>
        </div>
        <button style={{ background: 'none', color: 'var(--muted)', cursor: 'pointer' }} onClick={onCancel}>
          <X size={18} />
        </button>
      </div>

      {step === 1 && (
        <>
          <div className="review-details" style={{ marginBottom: 16 }}>
            <div className="review-detail-row"><span>Child</span><b>{classDetails.child}</b></div>
            <div className="review-detail-row"><span>Subject</span><b>{classDetails.subject}</b></div>
            <div className="review-detail-row"><span>Day</span><b>{classDetails.day}</b></div>
            <div className="review-detail-row"><span>Time</span><b>{classDetails.time}</b></div>
            <div className="review-detail-row"><span>Tutor</span><b>{classDetails.tutor}</b></div>
          </div>
          <div className="invoice-line"><span>Class fee</span><b>${classDetails.amount}.00</b></div>
          <div className="invoice-line"><span>GST (10%)</span><b>${classGst}.00</b></div>
          <div className="divider" />
          <div className="invoice-line total"><span>Total due</span><b>${classTotal}.00 AUD</b></div>
          <div className="bank-details-card" style={{ marginTop: 16 }}>
            <div className="bank-details-head"><CircleDollarSign size={18} /><span>Bank transfer details</span></div>
            <div className="bank-detail-row"><span>Account name</span><b>Fairybread &amp; Fractions Tutoring</b></div>
            <div className="bank-detail-row"><span>BSB</span><b>062 000</b></div>
            <div className="bank-detail-row"><span>Account number</span><b>1234 5678</b></div>
            <div className="bank-detail-row"><span>Reference</span><b>CLASS-{classDetails.child.split(' ')[0].toUpperCase()}-{classDetails.subject.slice(0, 4).toUpperCase()}</b></div>
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
          {!uploadedFile ? (
            <div className="upload-area" onClick={() => setUploadedFile('class-payment-receipt.jpg')}>
              <Upload size={28} /><strong>Drag &amp; drop or click to upload</strong><span>JPG, PNG or PDF · up to 10MB</span>
            </div>
          ) : (
            <div className="upload-attached">
              <div className="upload-file-info">
                <FileText size={20} />
                <div><strong>{uploadedFile}</strong><span>Attached · ready to submit</span></div>
                <Check size={18} className="teal-text" />
              </div>
              <button className="upload-remove" onClick={() => setUploadedFile(null)}>Remove file</button>
            </div>
          )}
          <div className="form-actions" style={{ marginTop: 16 }}>
            <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
            <Button disabled={!uploadedFile || isPending} onClick={() => submit()} icon={ArrowRight}>
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
  const qc = useQueryClient();
  const { gatingState, activeTerm, isLoading: eligibilityLoading } = useBookingEligibility(familyId);
  const familyName = FAMILY_NAMES[familyId] ?? familyId;

  // Detect if we arrived here from BookClassPage for an individual class payment
  const locationState = location.state as { type?: string; classDetails?: IndividualClassDetails } | null;
  const incomingClassDetails = locationState?.type === 'individual' ? locationState.classDetails : undefined;

  // Active purchase flow: null = list view, 'term' = term purchase, 'individual' = class payment
  const [activeFlow, setActiveFlow] = useState<PurchaseFlow | null>(
    incomingClassDetails ? 'individual' : null,
  );
  const [viewingPayment, setViewingPayment] = useState<Payment | null>(null);

  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ['payments', familyId],
    queryFn: () => dataClient.getPayments(familyId),
  });

  // Sort newest first
  const sorted = [...payments].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const paidTotal = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount + p.gst, 0);
  const pendingCount = payments.filter(p => p.status === 'pending').length;

  const isLoading = eligibilityLoading || paymentsLoading;

  function handleFlowDone() {
    setActiveFlow(null);
    // Clear the location state so refreshing doesn't re-open the individual flow
    navigate('/parent/payments', { replace: true });
    qc.invalidateQueries({ queryKey: ['payments', familyId] });
  }

  if (isLoading) return <div className="page-stack"><p>Loading…</p></div>;

  return (
    <div className="page-stack">

      {/* ── Header summary strip ── */}
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
            <strong>${paidTotal.toFixed(0)}</strong>
            <small>AUD · verified</small>
          </div>
          {/* Only show "Purchase term" if no active term or term expired */}
          {gatingState !== 'ACTIVE_TERM' && activeFlow === null && (
            <Button icon={Plus} onClick={() => setActiveFlow('term')}>
              {gatingState === 'TERM_EXPIRED' ? 'Renew term' : 'Purchase term'}
            </Button>
          )}
        </div>
      </div>

      {/* ── Active term status card ── */}
      {activeTerm && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 22px' }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--teal-soft)', color: 'var(--teal)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Check size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: 13, display: 'block' }}>Active term</strong>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              {activeTerm.classes_remaining} of {activeTerm.classes_included} credits remaining ·
              ends {new Date(activeTerm.end_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
          <Button variant="soft" onClick={() => navigate('/parent/book-class')} icon={ArrowRight}>Book a class</Button>
        </div>
      )}

      {/* ── Purchase flow panels (inline, not modal) ── */}
      {activeFlow === 'term' && (
        <TermPurchasePanel
          familyId={familyId}
          familyName={familyName}
          onDone={handleFlowDone}
          onCancel={() => setActiveFlow(null)}
        />
      )}

      {activeFlow === 'individual' && incomingClassDetails && (
        <IndividualPaymentPanel
          familyId={familyId}
          familyName={familyName}
          classDetails={incomingClassDetails}
          onDone={handleFlowDone}
          onCancel={() => { setActiveFlow(null); navigate('/parent/payments', { replace: true }); }}
        />
      )}

      {/* ── Payment list ── */}
      {activeFlow === null && (
        <>
          {sorted.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
              <CircleDollarSign size={32} style={{ color: 'var(--muted)', margin: '0 auto 12px', display: 'block' }} />
              <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>No payments on record yet.</p>
              <Button icon={Plus} onClick={() => setActiveFlow('term')}>Purchase a term</Button>
            </div>
          ) : (
            <>
              {/* Pending payments first */}
              {sorted.filter(p => p.status === 'pending').length > 0 && (
                <div>
                  <p className="label" style={{ marginBottom: 10 }}>Awaiting verification</p>
                  {sorted.filter(p => p.status === 'pending').map(p => (
                    <PaymentCard key={p.id} payment={p} onView={setViewingPayment} />
                  ))}
                </div>
              )}

              {/* All other payments */}
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

      {/* ── Payment detail modal ── */}
      {viewingPayment && (
        <PaymentDetailModal payment={viewingPayment} onClose={() => setViewingPayment(null)} />
      )}
    </div>
  );
}
