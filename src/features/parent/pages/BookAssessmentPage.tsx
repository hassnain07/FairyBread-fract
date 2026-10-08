import { ArrowRight, Check, CircleDollarSign, Clock3, FileText, Upload } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { Confetti } from '../../../components/ui/Sprinkles';
import { dataClient } from '../../../lib/data/client';
import { useAuth } from '../../../app/providers';
import { INDIVIDUAL_CLASS_PRICE, GST_RATE } from '../../../lib/config';

// TODO: confirm with client — assessment fee assumed same as INDIVIDUAL_CLASS_PRICE ($50).
const ASSESSMENT_FEE = INDIVIDUAL_CLASS_PRICE;
const ASSESSMENT_GST = Math.round(ASSESSMENT_FEE * GST_RATE);
const ASSESSMENT_TOTAL = ASSESSMENT_FEE + ASSESSMENT_GST;

const steps = ['Child', 'Date', 'Time', 'Summary', 'Payment', 'Upload', 'Verify'];
const slots = ['3:30 PM', '4:30 PM', '5:00 PM'];

const FAMILY_NAMES: Record<string, string> = {
  f1: 'Sarah Johnson', f2: 'Claire Brown', f3: 'James Taylor', f4: 'Michael Chen',
};

export function BookAssessmentPage() {
  const { familyId } = useAuth();
  const qc = useQueryClient();

  const [step, setStep] = useState(1);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [selectedDate, setSelectedDate] = useState(13);
  const [selectedSlot, setSelectedSlot] = useState(slots[0]);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);

  const { data: children = [], isLoading } = useQuery({
    queryKey: ['children', familyId],
    queryFn: () => dataClient.getChildren(familyId),
  });

  const selectedChild = children.find(c => c.id === selectedChildId) ?? children[0];

  const { mutate: submitAssessment } = useMutation({
    mutationFn: async () => {
      const familyName = FAMILY_NAMES[familyId] ?? familyId;
      const payment = await dataClient.submitPayment({
        family_id: familyId,
        family_name: familyName,
        type: 'individual_class',
        amount: ASSESSMENT_FEE,
        gst: ASSESSMENT_GST,
        status: 'pending',
        reference: `ASSESS-${(selectedChild?.name ?? 'CHILD').split(' ')[0].toUpperCase()}`,
        child_name: selectedChild?.name,
        class_subject: 'Assessment',
        receipt_filename: uploadedFile ?? undefined,
      });
      if (selectedChild) {
        await dataClient.createAssessment({
          family_id: familyId,
          child_id: selectedChild.id,
          payment_id: payment.id,
          outcome: 'pending',
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessments', familyId] });
      setStep(8);
    },
  });

  if (isLoading) return <div className="page-stack"><p>Loading...</p></div>;

  if (step === 8) {
    return (
      <div className="page-stack narrow-page">
        <div className="success-screen">
          <Confetti />
          <div className="success-mark large"><span>✦</span></div>
          <h2>Assessment Booked!</h2>
          <p>{selectedChild?.name.split(' ')[0]}'s learning journey is about to begin.</p>
          <div className="success-detail card">
            <div className="success-detail-row"><span>Child</span><b>{selectedChild?.name}</b></div>
            <div className="success-detail-row"><span>Date</span><b>Tuesday 14 October 2025</b></div>
            <div className="success-detail-row"><span>Time</span><b>{selectedSlot}</b></div>
            <div className="divider" />
            <div className="success-detail-row total"><span>Payment status</span><b className="pending-badge">Pending Verification</b></div>
          </div>
          <Button onClick={() => { setStep(1); setUploadedFile(null); setSelectedChildId(''); }} icon={ArrowRight}>Back to dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack narrow-page">
      <div className="assessment-layout">
        <div>
          <div className="assessment-steps">
            {steps.map((s, i) => (
              <div key={s} className={step === i + 1 ? 'active' : step > i + 1 ? 'done' : ''}>
                <span>{step > i + 1 ? <Check size={13} /> : i + 1}</span>{s}
              </div>
            ))}
          </div>
          <div className="card assessment-card">
            {step === 1 && (
              <>
                <span className="label">Step 1 · Select child</span>
                <h3>Who is this assessment for?</h3>
                {children.length === 0 && (
                  <p style={{ color: 'var(--muted)', fontSize: 13 }}>No children on your account yet. Add a child first.</p>
                )}
                <div className="child-select-list">
                  {children.map(c => (
                    <button key={c.id} className={selectedChildId === c.id || (!selectedChildId && c.id === children[0]?.id) ? 'selected' : ''} onClick={() => setSelectedChildId(c.id)}>
                      <div className="child-avatar">{c.initials}</div>
                      <div><strong>{c.name}</strong><span>{c.year} · {c.school}</span></div>
                      {(selectedChildId === c.id || (!selectedChildId && c.id === children[0]?.id)) && <Check size={18} />}
                    </button>
                  ))}
                </div>
                <Button className="full" disabled={children.length === 0} onClick={() => setStep(2)} icon={ArrowRight}>Continue</Button>
              </>
            )}
            {step === 2 && (
              <>
                <span className="label">Step 2 · Select date</span>
                <h3>Pick a day that works</h3>
                <div className="calendar-head">
                  <button onClick={() => setStep(1)}>‹</button>
                  <strong>October 2025</strong>
                  <button>›</button>
                </div>
                <div className="calendar-week">{['M','T','W','T','F','S','S'].map((x, i) => <span key={i}>{x}</span>)}</div>
                <div className="calendar-days">
                  {Array.from({ length: 31 }, (_, i) => (
                    <button key={i} className={i === selectedDate ? 'selected' : [1,2,8,9,15,16].includes(i) ? 'available' : ''} onClick={() => [1,2,8,9,15,16].includes(i) && setSelectedDate(i)}>{i + 1}</button>
                  ))}
                </div>
                <Button className="full" onClick={() => setStep(3)} icon={ArrowRight}>Continue</Button>
              </>
            )}
            {step === 3 && (
              <>
                <span className="label">Step 3 · Select time</span>
                <h3>What time suits you?</h3>
                <div className="slots">
                  {slots.map(s => (
                    <button key={s} className={selectedSlot === s ? 'selected' : ''} onClick={() => setSelectedSlot(s)}>
                      <Clock3 size={15} />{s}<span>{selectedSlot === s ? <Check size={15} /> : 'Available'}</span>
                    </button>
                  ))}
                </div>
                <div className="form-actions">
                  <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
                  <Button onClick={() => setStep(4)} icon={ArrowRight}>Continue</Button>
                </div>
              </>
            )}
            {step === 4 && (
              <>
                <span className="label">Step 4 · Booking summary</span>
                <h3>Does this look right?</h3>
                <div className="summary-line"><span>Child</span><b>{selectedChild?.name}</b></div>
                <div className="summary-line"><span>Date</span><b>Tuesday 14 October 2025</b></div>
                <div className="summary-line"><span>Time</span><b>{selectedSlot}</b></div>
                <div className="divider" />
                <div className="summary-line total"><span>Total</span><b>${ASSESSMENT_TOTAL} AUD</b></div>
                <div className="form-actions">
                  <Button variant="ghost" onClick={() => setStep(3)}>Back</Button>
                  <Button onClick={() => setStep(5)} icon={ArrowRight}>Continue to payment</Button>
                </div>
              </>
            )}
            {step === 5 && (
              <>
                <span className="label">Step 5 · Payment</span>
                <h3>Confirm your booking</h3>
                <div className="mock-payment-card">
                  <div className="pay-row"><span>Initial Learning Assessment</span><b>${ASSESSMENT_FEE}.00</b></div>
                  <div className="pay-row"><span>GST (10%)</span><b>${ASSESSMENT_GST}.00</b></div>
                  <div className="divider" />
                  <div className="pay-row total"><span>Total</span><b>${ASSESSMENT_TOTAL}.00 AUD</b></div>
                </div>
                <div className="bank-details-card">
                  <div className="bank-details-head"><CircleDollarSign size={18} /><span>Bank transfer details</span></div>
                  <div className="bank-detail-row"><span>Account name</span><b>Fairybread &amp; Fractions Tutoring</b></div>
                  <div className="bank-detail-row"><span>BSB</span><b>062 000</b></div>
                  <div className="bank-detail-row"><span>Account number</span><b>1234 5678</b></div>
                  <div className="bank-detail-row"><span>Reference</span><b>ASSESS-{(selectedChild?.name ?? 'CHILD').split(' ')[0].toUpperCase()}</b></div>
                </div>
                <div className="form-actions">
                  <Button variant="ghost" onClick={() => setStep(4)}>Back</Button>
                  <Button onClick={() => setStep(6)} icon={Check}>I've made this payment</Button>
                </div>
              </>
            )}
            {step === 6 && (
              <>
                <span className="label">Step 6 · Upload proof of payment</span>
                <h3>Share your receipt</h3>
                {!uploadedFile ? (
                  <div className="upload-area" onClick={() => setUploadedFile('assessment-receipt.jpg')}>
                    <Upload size={28} /><strong>Drag &amp; drop or click to upload</strong><span>JPG, PNG or PDF · up to 10MB</span>
                  </div>
                ) : (
                  <div className="upload-attached">
                    <div className="upload-file-info">
                      <FileText size={20} /><div><strong>{uploadedFile}</strong><span>Attached · ready to submit</span></div>
                      <Check size={18} className="teal-text" />
                    </div>
                    <button className="upload-remove" onClick={() => setUploadedFile(null)}>Remove file</button>
                  </div>
                )}
                <div className="form-actions">
                  <Button variant="ghost" onClick={() => setStep(5)}>Back</Button>
                  <Button disabled={!uploadedFile} onClick={() => submitAssessment()} icon={ArrowRight}>Submit proof</Button>
                </div>
              </>
            )}
            {step === 7 && (
              <>
                <div className="pending-verify-card">
                  <div className="pending-verify-icon"><Clock3 size={32} /></div>
                  <h3>Payment Pending Verification</h3>
                  <p>Thank you! We've received your proof of payment. Our team will verify it shortly — usually within 1–2 business days.</p>
                  <div className="pending-verify-detail">
                    <div className="pending-detail-row"><span>Amount</span><b>${ASSESSMENT_TOTAL}.00 AUD</b></div>
                    <div className="pending-detail-row"><span>Status</span><b className="pending-badge">Pending</b></div>
                  </div>
                </div>
                <div className="form-actions">
                  <Button onClick={() => setStep(8)} icon={ArrowRight}>Back to dashboard</Button>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="booking-summary card">
          <span className="label">Your booking</span>
          <h3>Initial Learning Assessment</h3>
          <div className="summary-line"><span>Child</span><b>{selectedChild?.name ?? '—'}</b></div>
          <div className="summary-line"><span>Time</span><b>{selectedSlot}</b></div>
          <div className="divider" />
          <div className="summary-line total"><span>Total</span><b>${ASSESSMENT_TOTAL} AUD</b></div>
        </div>
      </div>
    </div>
  );
}
