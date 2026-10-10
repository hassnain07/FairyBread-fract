import { ArrowRight, Check, CircleDollarSign, Clock3 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { Confetti } from '../../../components/ui/Sprinkles';
import { dataClient } from '../../../lib/data/client';
import { useAuth } from '../../../app/providers';
import { qk } from '../../../lib/data/queryKeys';
import { formatMoney } from '../../../lib/utils/money';
import { toAppError } from '../../../lib/data/errors';
import { ProofUpload, validateProof } from '../../payments/ProofUpload';

const steps = ['Child', 'Date', 'Time', 'Summary', 'Payment', 'Upload', 'Done'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function toTimeLabel(t: string) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function buildAvailableDates(weekdays: number[], leadDays: number, horizonDays: number, closures: string[]): Date[] {
  const dates: Date[] = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today); start.setDate(today.getDate() + leadDays);
  const end = new Date(today); end.setDate(today.getDate() + horizonDays);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    // JS getDay(): 0=Sun,1=Mon…6=Sat; weekdays in settings are ISO 1=Mon…7=Sun
    const jsDay = d.getDay();
    const isoDay = jsDay === 0 ? 7 : jsDay;
    if (weekdays.includes(isoDay) && !closures.includes(iso)) {
      dates.push(new Date(d));
    }
  }
  return dates;
}

export function BookAssessmentPage() {
  const { familyId } = useAuth();
  const qc = useQueryClient();
  const idRef = useRef(crypto.randomUUID());

  const [step, setStep] = useState(1);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [calMonth, setCalMonth] = useState<{ year: number; month: number } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [submitError, setSubmitError] = useState('');

  const { data: children = [], isLoading: loadingChildren } = useQuery({
    queryKey: qk.children(familyId),
    queryFn: () => dataClient.getChildren(familyId),
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

  const { data: quote } = useQuery({
    queryKey: qk.quote('assessment', familyId),
    queryFn: () => dataClient.getPriceQuote!('assessment', familyId),
    enabled: !!familyId,
  });

  const assessmentCfg = (settings as any)?.assessment_booking ?? {};
  const slots: string[] = assessmentCfg.slots ?? ['15:30', '16:30', '17:00'];
  const weekdays: number[] = assessmentCfg.weekdays ?? [1, 2, 3, 4, 5];
  const leadDays: number = assessmentCfg.lead_days ?? 2;
  const horizonDays: number = assessmentCfg.horizon_days ?? 42;
  const closures: string[] = (settings as any)?.closures ?? [];

  const bank = (settings as any)?.public_info?.bank ?? {};
  const refCode = family?.reference_code ?? familyId;

  const availableDates = buildAvailableDates(weekdays, leadDays, horizonDays, closures);

  const firstAvail = availableDates[0];
  const lastAvail = availableDates[availableDates.length - 1];
  const calYear = calMonth?.year ?? firstAvail?.getFullYear() ?? new Date().getFullYear();
  const calMon = calMonth?.month ?? firstAvail?.getMonth() ?? new Date().getMonth();

  const availableSet = new Set(availableDates.map(d => d.toISOString().slice(0, 10)));

  function calDays(): (Date | null)[] {
    const first = new Date(calYear, calMon, 1);
    const startPad = first.getDay(); // 0=Sun
    const daysInMonth = new Date(calYear, calMon + 1, 0).getDate();
    const cells: (Date | null)[] = Array(startPad).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(calYear, calMon, d));
    return cells;
  }

  const canPrevMonth = firstAvail ? (calYear > firstAvail.getFullYear() || calMon > firstAvail.getMonth()) : false;
  const canNextMonth = lastAvail ? (calYear < lastAvail.getFullYear() || calMon < lastAvail.getMonth()) : false;

  function prevMonth() { const d = new Date(calYear, calMon - 1, 1); setCalMonth({ year: d.getFullYear(), month: d.getMonth() }); }
  function nextMonth() { const d = new Date(calYear, calMon + 1, 1); setCalMonth({ year: d.getFullYear(), month: d.getMonth() }); }

  const selectedChild = children.find(c => c.id === selectedChildId) ?? children[0];

  const { mutate: submitAssessment, isPending } = useMutation({
    mutationFn: () => {
      if (!file || !selectedDate || !selectedSlot || !selectedChild) throw new Error('invalid_input');
      const dateStr = selectedDate.toISOString().slice(0, 10);
      return dataClient.submitPayment!(
        { type: 'assessment', familyId, childId: selectedChild.id, date: dateStr, time: selectedSlot },
        file
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.payments(familyId) });
      qc.invalidateQueries({ queryKey: qk.assessments(familyId) });
      idRef.current = crypto.randomUUID();
      setStep(7);
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
    submitAssessment();
  }

  if (loadingChildren) return <div className="page-stack"><p>Loading…</p></div>;

  if (step === 7) {
    return (
      <div className="page-stack narrow-page">
        <div className="success-screen">
          <Confetti />
          <div className="success-mark large"><span>✦</span></div>
          <h2>Assessment Booked!</h2>
          <p>{selectedChild?.givenName}'s learning journey is about to begin.</p>
          <div className="success-detail card">
            <div className="success-detail-row"><span>Child</span><b>{selectedChild?.name}</b></div>
            {selectedDate && <div className="success-detail-row"><span>Date</span><b>{selectedDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</b></div>}
            <div className="success-detail-row"><span>Time</span><b>{toTimeLabel(selectedSlot)}</b></div>
            <div className="divider" />
            <div className="success-detail-row total"><span>Payment status</span><b className="pending-badge">Pending Verification</b></div>
          </div>
          <Button onClick={() => { setStep(1); setFile(null); setSelectedChildId(''); setSelectedDate(null); setSelectedSlot(''); setCalMonth(null); }} icon={ArrowRight}>Back to dashboard</Button>
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
                {children.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>No children on your account yet. Add a child first.</p>}
                <div className="child-select-list">
                  {children.map(c => (
                    <button key={c.id} className={selectedChildId === c.id || (!selectedChildId && c.id === children[0]?.id) ? 'selected' : ''} onClick={() => setSelectedChildId(c.id)}>
                      <div className="child-avatar">{c.initials}</div>
                      <div><strong>{c.name}</strong><span>{c.year} · {c.school}</span></div>
                      {(selectedChildId === c.id || (!selectedChildId && c.id === children[0]?.id)) && <Check size={18} />}
                    </button>
                  ))}
                </div>
                <Button className="full" disabled={children.length === 0} onClick={() => { setCalMonth(null); setStep(2); }} icon={ArrowRight}>Continue</Button>
              </>
            )}

            {step === 2 && (
              <>
                <span className="label">Step 2 · Select date</span>
                <h3>Pick a day that works</h3>
                {availableDates.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>No available dates right now. Please contact us.</p>}
                <div className="calendar-head">
                  <button onClick={prevMonth} disabled={!canPrevMonth} style={{ opacity: canPrevMonth ? 1 : 0.25 }}>‹</button>
                  <strong>{MONTH_NAMES[calMon]} {calYear}</strong>
                  <button onClick={nextMonth} disabled={!canNextMonth} style={{ opacity: canNextMonth ? 1 : 0.25 }}>›</button>
                </div>
                <div className="calendar-week">
                  {DAY_NAMES.map(n => <span key={n}>{n}</span>)}
                </div>
                <div className="calendar-days">
                  {calDays().map((d, i) => {
                    if (!d) return <span key={i} />;
                    const iso = d.toISOString().slice(0, 10);
                    const avail = availableSet.has(iso);
                    const isSelected = selectedDate?.toISOString().slice(0, 10) === iso;
                    return (
                      <button key={iso}
                        className={isSelected ? 'selected' : avail ? 'available' : ''}
                        disabled={!avail}
                        onClick={() => setSelectedDate(d)}>
                        {d.getDate()}
                      </button>
                    );
                  })}
                </div>
                {selectedDate && (
                  <p style={{ fontSize: 12, color: 'var(--pink)', marginTop: 12, fontWeight: 600 }}>
                    ✓ {selectedDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                )}
                <div className="form-actions" style={{ marginTop: 16 }}>
                  <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                  <Button disabled={!selectedDate} onClick={() => setStep(3)} icon={ArrowRight}>Continue</Button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <span className="label">Step 3 · Select time</span>
                <h3>What time suits you?</h3>
                <div className="slots">
                  {slots.map(s => (
                    <button key={s} className={selectedSlot === s ? 'selected' : ''} onClick={() => setSelectedSlot(s)}>
                      <Clock3 size={15} />{toTimeLabel(s)}<span>{selectedSlot === s ? <Check size={15} /> : 'Available'}</span>
                    </button>
                  ))}
                </div>
                <div className="form-actions">
                  <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
                  <Button disabled={!selectedSlot} onClick={() => setStep(4)} icon={ArrowRight}>Continue</Button>
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <span className="label">Step 4 · Booking summary</span>
                <h3>Does this look right?</h3>
                <div className="summary-line"><span>Child</span><b>{selectedChild?.name}</b></div>
                {selectedDate && <div className="summary-line"><span>Date</span><b>{selectedDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}</b></div>}
                <div className="summary-line"><span>Time</span><b>{toTimeLabel(selectedSlot)}</b></div>
                <div className="divider" />
                {quote && <div className="summary-line total"><span>Total</span><b>{formatMoney(quote.total_cents)} AUD</b></div>}
                <div className="form-actions">
                  <Button variant="ghost" onClick={() => setStep(3)}>Back</Button>
                  <Button onClick={() => setStep(5)} icon={ArrowRight}>Continue to payment</Button>
                </div>
              </>
            )}

            {step === 5 && quote && (
              <>
                <span className="label">Step 5 · Payment</span>
                <h3>Confirm your booking</h3>
                <div className="mock-payment-card">
                  <div className="pay-row"><span>Initial Learning Assessment</span><b>{formatMoney(quote.amount_cents)}</b></div>
                  <div className="pay-row"><span>GST (10%)</span><b>{formatMoney(quote.gst_cents)}</b></div>
                  <div className="divider" />
                  <div className="pay-row total"><span>Total</span><b>{formatMoney(quote.total_cents)} AUD</b></div>
                </div>
                <div className="bank-details-card">
                  <div className="bank-details-head"><CircleDollarSign size={18} /><span>Bank transfer details</span></div>
                  <div className="bank-detail-row"><span>Account name</span><b>{bank.account_name ?? '—'}</b></div>
                  <div className="bank-detail-row"><span>BSB</span><b>{bank.bsb ?? '—'}</b></div>
                  <div className="bank-detail-row"><span>Account number</span><b>{bank.account ?? '—'}</b></div>
                  <div className="bank-detail-row"><span>Reference</span><b>{refCode}-ASSESS</b></div>
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
                <ProofUpload file={file} onChange={handleFileChange} error={fileError} />
                {submitError && <p className="auth-error" style={{ marginTop: 8 }}>{submitError}</p>}
                <div className="form-actions" style={{ marginTop: 16 }}>
                  <Button variant="ghost" onClick={() => setStep(5)}>Back</Button>
                  <Button disabled={!file || isPending} onClick={handleSubmit} icon={ArrowRight}>
                    {isPending ? 'Submitting…' : 'Submit proof'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="booking-summary card">
          <span className="label">Your booking</span>
          <h3>Initial Learning Assessment</h3>
          <div className="summary-line"><span>Child</span><b>{selectedChild?.name ?? '—'}</b></div>
          {selectedDate && <div className="summary-line"><span>Date</span><b>{selectedDate.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</b></div>}
          {selectedSlot && <div className="summary-line"><span>Time</span><b>{toTimeLabel(selectedSlot)}</b></div>}
          <div className="divider" />
          {quote && <div className="summary-line total"><span>Total</span><b>{formatMoney(quote.total_cents)} AUD</b></div>}
        </div>
      </div>
    </div>
  );
}
