import { ArrowRight, Check, CircleDollarSign, CreditCard, Plus, Ticket, Users, X } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { dataClient } from '../../../lib/data/client';
import { TermCreditMeter } from '../../../components/domain/TermCreditMeter';
import type { Child } from '../../../types/family';
import type { Term } from '../../../types/term';
import { TERM_BASE_PRICE, REGISTRATION_FEE, GST_RATE, TERM_CREDITS, INDIVIDUAL_CLASS_PRICE } from '../../../lib/config';

const TERM_SUBTOTAL = TERM_BASE_PRICE + REGISTRATION_FEE;
const TERM_GST = Math.round(TERM_SUBTOTAL * GST_RATE);
const TERM_TOTAL = TERM_SUBTOTAL + TERM_GST;

const FAMILY_NAMES: Record<string, string> = {
  f1: 'Sarah Johnson', f2: 'Claire Brown', f3: 'James Taylor', f4: 'Michael Chen',
};

const CLASS_OPTIONS = [
  { id: 'ci1', subject: 'Mathematics', day: 'Monday',    time: '3:30 PM', tutor: 'Jessica Taylor', color: 'pink',   spaces: '4 spaces' },
  { id: 'ci2', subject: 'English',     day: 'Wednesday', time: '4:30 PM', tutor: 'Sarah Wilson',   color: 'teal',   spaces: '2 spaces' },
  { id: 'ci3', subject: 'Reading',     day: 'Thursday',  time: '4:00 PM', tutor: 'Daniel Smith',   color: 'orange', spaces: 'FULL' },
  { id: 'ci4', subject: 'Mathematics', day: 'Friday',    time: '3:00 PM', tutor: 'Jessica Taylor', color: 'pink',   spaces: '5 spaces' },
];

type Step = 'family' | 'action' | 'book-class' | 'term-purchase' | 'done';

type DoneState = {
  type: 'term' | 'class-credit' | 'class-individual';
  familyName: string;
  childName?: string;
  subject?: string;
  day?: string;
  time?: string;
  tutor?: string;
};

export function AdminFamilyBookingPage() {
  const qc = useQueryClient();

  // Step state
  const [step, setStep] = useState<Step>('family');
  const [selectedFamilyId, setSelectedFamilyId] = useState('');
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [bookingMode, setBookingMode] = useState<'term' | 'individual'>('term');
  const [confirmingClass, setConfirmingClass] = useState<typeof CLASS_OPTIONS[0] | null>(null);
  const [doneState, setDoneState] = useState<DoneState | null>(null);

  // Add child form
  const [showAddChild, setShowAddChild] = useState(false);
  const [newChild, setNewChild] = useState({ name: '', year: 'Year 5', school: '' });

  // Queries
  const { data: families = [] } = useQuery({
    queryKey: ['allFamilies'],
    queryFn: () => dataClient.getAllFamilies(),
  });

  const { data: children = [] } = useQuery({
    queryKey: ['children', selectedFamilyId],
    queryFn: () => dataClient.getChildren(selectedFamilyId),
    enabled: !!selectedFamilyId,
  });

  const { data: activeTerm } = useQuery<Term | null>({
    queryKey: ['activeTerm', selectedFamilyId],
    queryFn: () => dataClient.getActiveTerm(selectedFamilyId),
    enabled: !!selectedFamilyId,
  });

  const familyName = selectedFamilyId ? (FAMILY_NAMES[selectedFamilyId] ?? selectedFamilyId) : '';
  const enrolledChildren = children.filter(c => c.enrolled);
  const hasActiveTerm = !!activeTerm;
  const creditsLeft = activeTerm?.classes_remaining ?? 0;

  // Mutations
  const { mutate: purchaseTerm, isPending: purchasingTerm } = useMutation({
    mutationFn: async () => {
      const payment = await dataClient.submitPayment({
        family_id: selectedFamilyId, family_name: familyName, type: 'term',
        amount: TERM_SUBTOTAL, gst: TERM_GST, status: 'paid',
        reference: `TERM-${selectedFamilyId.toUpperCase()}-ADMIN`,
        term_label: 'Term 3, 2025',
      });
      await dataClient.verifyPayment(payment.id, 'approve');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activeTerm', selectedFamilyId] });
      qc.invalidateQueries({ queryKey: ['allPayments'] });
      setDoneState({ type: 'term', familyName });
      setStep('done');
    },
  });

  const { mutate: bookClass, isPending: bookingClass } = useMutation({
    mutationFn: async (cls: typeof CLASS_OPTIONS[0]) => {
      if (!selectedChild) return;
      if (bookingMode === 'term') {
        await dataClient.createBooking({
          family_id: selectedFamilyId, child_id: selectedChild.id,
          class_instance_id: cls.id, source: 'term_credit',
          status: 'confirmed', credit_consumed: true,
        });
      } else {
        await dataClient.submitPayment({
          family_id: selectedFamilyId, family_name: familyName, type: 'individual_class',
          amount: INDIVIDUAL_CLASS_PRICE, gst: Math.round(INDIVIDUAL_CLASS_PRICE * GST_RATE),
          status: 'pending', reference: `CLASS-${selectedChild.name.split(' ')[0].toUpperCase()}-${cls.subject.slice(0,4).toUpperCase()}-ADMIN`,
          child_name: selectedChild.name, class_subject: cls.subject,
          class_day: cls.day, class_time: cls.time, class_tutor: cls.tutor,
        });
      }
    },
    onSuccess: (_, cls) => {
      qc.invalidateQueries({ queryKey: ['activeTerm', selectedFamilyId] });
      qc.invalidateQueries({ queryKey: ['allBookings'] });
      setDoneState({
        type: bookingMode === 'term' ? 'class-credit' : 'class-individual',
        familyName, childName: selectedChild?.name,
        subject: cls.subject, day: cls.day, time: cls.time, tutor: cls.tutor,
      });
      setConfirmingClass(null);
      setStep('done');
    },
  });

  const { mutate: addChild, isPending: addingChild } = useMutation({
    mutationFn: () => dataClient.addChild(selectedFamilyId, {
      name: newChild.name, initials: newChild.name.split(' ').map(w => w[0]).join('').toUpperCase(),
      year: newChild.year, school: newChild.school, enrolled: true,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['children', selectedFamilyId] });
      setShowAddChild(false);
      setNewChild({ name: '', year: 'Year 5', school: '' });
    },
  });

  function reset() {
    setStep('family'); setSelectedFamilyId(''); setSelectedChild(null);
    setBookingMode('term'); setDoneState(null);
  }

  // ── Step: Done ──────────────────────────────────────────────────────────────
  if (step === 'done' && doneState) {
    return (
      <div className="page-stack">
        <div className="card" style={{ textAlign: 'center', padding: '48px 32px' }}>
          <div className="success-mark" style={{ margin: '0 auto 20px' }}><Check size={26} /></div>
          <h2 style={{ fontSize: 26, marginBottom: 10 }}>
            {doneState.type === 'term' ? 'Term purchased!' : 'Class booked!'}
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, maxWidth: 380, margin: '0 auto 28px' }}>
            {doneState.type === 'term' && `${doneState.familyName}'s account now has ${TERM_CREDITS} class credits ready to use.`}
            {doneState.type === 'class-credit' && `${doneState.childName}'s ${doneState.subject} class on ${doneState.day} at ${doneState.time} has been confirmed using a term credit.`}
            {doneState.type === 'class-individual' && `${doneState.childName}'s ${doneState.subject} class on ${doneState.day} at ${doneState.time} is pending payment verification. It will appear in the Payments page for review.`}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button onClick={() => { setStep('action'); setDoneState(null); }} icon={ArrowRight}>
              Do more for {doneState.familyName.split(' ')[0]}
            </Button>
            <Button variant="soft" onClick={reset}>Start over</Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step: Term purchase ─────────────────────────────────────────────────────
  if (step === 'term-purchase') {
    return (
      <div className="page-stack">
        <div className="page-toolbar">
          <div>
            <h2>Purchase term — {familyName}</h2>
            <p>Record a term payment on behalf of this family. Payment is marked as paid immediately.</p>
          </div>
          <Button variant="ghost" onClick={() => setStep('action')}>← Back</Button>
        </div>
        <div className="card invoice" style={{ maxWidth: 560 }}>
          <div className="invoice-head">
            <div><span className="label">Admin — on behalf of {familyName}</span><h3>10-week term package</h3></div>
          </div>
          <div className="invoice-line"><span>10-week term ({TERM_CREDITS} class credits)</span><b>${TERM_BASE_PRICE}</b></div>
          <div className="invoice-line"><span>Registration fee</span><b>${REGISTRATION_FEE}</b></div>
          <div className="divider" />
          <div className="invoice-line"><span>Subtotal</span><b>${TERM_SUBTOTAL}</b></div>
          <div className="invoice-line"><span>GST (10%)</span><b>${TERM_GST}</b></div>
          <div className="divider" />
          <div className="invoice-line total"><span>Total</span><b>${TERM_TOTAL} AUD</b></div>
          <div className="admin-booking-note">
            <CircleDollarSign size={16} />
            <span>This will immediately activate a new term for {familyName} with {TERM_CREDITS} class credits. Record the payment method separately if needed.</span>
          </div>
          <div className="invoice-actions">
            <Button variant="ghost" onClick={() => setStep('action')}>Cancel</Button>
            <Button icon={Check} onClick={() => purchaseTerm()} disabled={purchasingTerm}>
              {purchasingTerm ? 'Processing…' : 'Confirm & activate term'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step: Book class ────────────────────────────────────────────────────────
  if (step === 'book-class') {
    return (
      <div className="page-stack">
        <div className="page-toolbar">
          <div>
            <h2>Book a class — {familyName}</h2>
            <p>Select a child and class to book on behalf of this family.</p>
          </div>
          <Button variant="ghost" onClick={() => setStep('action')}>← Back</Button>
        </div>

        {/* Child picker */}
        <div className="card">
          <span className="label" style={{ display: 'block', marginBottom: 10 }}>Select child</span>
          {enrolledChildren.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>No enrolled children. Add one below.</p>
          )}
          <div className="child-switcher" style={{ marginBottom: 12 }}>
            {enrolledChildren.map(c => (
              <button key={c.id} className={selectedChild?.id === c.id ? 'active' : ''} onClick={() => setSelectedChild(c)}>
                <span className="switcher-avatar">{c.initials}</span>
                <span className="switcher-name">{c.name.split(' ')[0]}</span>
              </button>
            ))}
            <button onClick={() => setShowAddChild(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f4f7f3', border: '1px dashed var(--line)', borderRadius: 11, padding: '9px 14px', fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
              <Plus size={14} /> Add child
            </button>
          </div>
        </div>

        {/* Term credit meter */}
        {activeTerm && <TermCreditMeter term={activeTerm} />}

        {/* Booking mode */}
        {selectedChild && (
          <div className="booking-mode-toggle">
            <span className="booking-mode-label">Booking method</span>
            <div className="booking-mode-options">
              <button
                className={`booking-mode-btn ${bookingMode === 'term' ? 'active' : ''} ${!hasActiveTerm || creditsLeft === 0 ? 'disabled' : ''}`}
                onClick={() => (hasActiveTerm && creditsLeft > 0) && setBookingMode('term')}
              >
                <Ticket size={16} />
                <div>
                  <strong>Use term credit</strong>
                  <span>{hasActiveTerm ? `${creditsLeft} credit${creditsLeft !== 1 ? 's' : ''} remaining` : 'No active term'}</span>
                </div>
                {bookingMode === 'term' && hasActiveTerm && creditsLeft > 0 && <Check size={15} className="mode-check" />}
              </button>
              <button
                className={`booking-mode-btn ${bookingMode === 'individual' ? 'active' : ''}`}
                onClick={() => setBookingMode('individual')}
              >
                <CreditCard size={16} />
                <div>
                  <strong>Individual class</strong>
                  <span>${INDIVIDUAL_CLASS_PRICE} · pending verification</span>
                </div>
                {bookingMode === 'individual' && <Check size={15} className="mode-check" />}
              </button>
            </div>
          </div>
        )}

        {/* Class cards */}
        {selectedChild && (
          <div className="classes-list">
            {CLASS_OPTIONS.map(cls => {
              const isFull = cls.spaces === 'FULL';
              const canBook = !isFull && (bookingMode === 'individual' || (hasActiveTerm && creditsLeft > 0));
              return (
                <div className={`class-card ${cls.color}`} key={cls.id}>
                  <div className="class-card-top">
                    <span className="class-subject">{cls.subject.toUpperCase()}</span>
                    <span className={`space-badge ${isFull ? 'full-badge' : ''}`}>{cls.spaces}</span>
                  </div>
                  <div className="class-card-when"><h3>{cls.day}</h3><span>{cls.time}</span></div>
                  <div className="class-tutor">
                    <div className={`mini-avatar ${cls.color}-bg`}>{cls.tutor.split(' ').map(w => w[0]).join('')}</div>
                    <span>with <b>{cls.tutor}</b></span>
                  </div>
                  <div className="class-card-cost">
                    {bookingMode === 'term'
                      ? <span className="cost-badge credit">1 credit</span>
                      : <span className="cost-badge individual">${INDIVIDUAL_CLASS_PRICE}</span>}
                  </div>
                  {canBook
                    ? <Button onClick={() => setConfirmingClass(cls)} icon={Check}>Book for {selectedChild.name.split(' ')[0]}</Button>
                    : <Button variant="soft" disabled>{isFull ? 'Class full' : 'No credits'}</Button>}
                </div>
              );
            })}
          </div>
        )}

        {/* Confirm modal */}
        {confirmingClass && (
          <div className="modal-backdrop" onClick={() => setConfirmingClass(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setConfirmingClass(null)}><X size={18} /></button>
              <div className="modal-icon"><Check size={22} /></div>
              <h2>Confirm booking</h2>
              <p>Booking on behalf of <strong>{familyName}</strong>.</p>
              <div className="review-details">
                <div className="review-detail-row"><span>Child</span><b>{selectedChild?.name}</b></div>
                <div className="review-detail-row"><span>Subject</span><b>{confirmingClass.subject}</b></div>
                <div className="review-detail-row"><span>Day</span><b>{confirmingClass.day}</b></div>
                <div className="review-detail-row"><span>Time</span><b>{confirmingClass.time}</b></div>
                <div className="review-detail-row"><span>Tutor</span><b>{confirmingClass.tutor}</b></div>
                <div className="review-detail-row">
                  <span>Cost</span>
                  <b>{bookingMode === 'term' ? '1 term credit' : `$${INDIVIDUAL_CLASS_PRICE} — pending payment verification`}</b>
                </div>
              </div>
              <Button icon={Check} onClick={() => bookClass(confirmingClass)} disabled={bookingClass}>
                {bookingClass ? 'Booking…' : 'Confirm booking'}
              </Button>
              <button className="modal-cancel" onClick={() => setConfirmingClass(null)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Add child modal */}
        {showAddChild && (
          <div className="modal-backdrop" onClick={() => setShowAddChild(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setShowAddChild(false)}><X size={18} /></button>
              <div className="modal-icon"><Plus size={22} /></div>
              <h2>Add child</h2>
              <p>Add and enrol a child to {familyName}'s account.</p>
              <div className="add-modal-form">
                <label>Full name<input value={newChild.name} onChange={e => setNewChild(s => ({ ...s, name: e.target.value }))} placeholder="e.g. Emma Johnson" /></label>
                <label>Year level
                  <select value={newChild.year} onChange={e => setNewChild(s => ({ ...s, year: e.target.value }))}>
                    {['Year 1','Year 2','Year 3','Year 4','Year 5','Year 6'].map(y => <option key={y}>{y}</option>)}
                  </select>
                </label>
                <label>School<input value={newChild.school} onChange={e => setNewChild(s => ({ ...s, school: e.target.value }))} placeholder="e.g. Riverside Primary" /></label>
              </div>
              <div className="review-actions">
                <Button variant="ghost" onClick={() => setShowAddChild(false)} icon={X}>Cancel</Button>
                <Button icon={Check} onClick={() => addChild()} disabled={!newChild.name.trim() || addingChild}>
                  {addingChild ? 'Saving…' : 'Add & enrol'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Step: Action picker ─────────────────────────────────────────────────────
  if (step === 'action') {
    return (
      <div className="page-stack">
        <div className="page-toolbar">
          <div>
            <h2>What would you like to do?</h2>
            <p>Managing account for <strong>{familyName}</strong></p>
          </div>
          <Button variant="ghost" onClick={reset}>← Change family</Button>
        </div>

        {/* Family status card */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="profile-drawer-avatar" style={{ width: 46, height: 46, fontSize: 15 }}>
            {familyName.split(' ').map(w => w[0]).join('')}
          </div>
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: 15 }}>{familyName}</strong>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
              {enrolledChildren.length} enrolled child{enrolledChildren.length !== 1 ? 'ren' : ''} ·{' '}
              {hasActiveTerm ? `Active term · ${creditsLeft} credit${creditsLeft !== 1 ? 's' : ''} remaining` : 'No active term'}
            </p>
          </div>
          {hasActiveTerm
            ? <span className="table-status confirmed">Active term</span>
            : <span className="table-status pending">No term</span>}
        </div>

        {activeTerm && <TermCreditMeter term={activeTerm} />}

        {/* Action cards */}
        <div className="admin-booking-actions">
          <button className="admin-booking-action-card" onClick={() => setStep('book-class')} disabled={enrolledChildren.length === 0 && !hasActiveTerm}>
            <div className="admin-booking-action-icon teal-bg"><Ticket size={22} /></div>
            <strong>Book a class</strong>
            <span>Reserve a spot in a class using a term credit or individual payment.</span>
            <div className="admin-booking-action-arrow"><ArrowRight size={16} /></div>
          </button>
          <button className="admin-booking-action-card" onClick={() => setStep('term-purchase')} disabled={hasActiveTerm}>
            <div className="admin-booking-action-icon pink-bg"><CircleDollarSign size={22} /></div>
            <strong>{hasActiveTerm ? 'Term already active' : 'Purchase a term'}</strong>
            <span>{hasActiveTerm ? `${creditsLeft} credits remaining on current term.` : `Activate a 10-week term with ${TERM_CREDITS} class credits for $${TERM_TOTAL}.`}</span>
            <div className="admin-booking-action-arrow"><ArrowRight size={16} /></div>
          </button>
        </div>
      </div>
    );
  }

  // ── Step: Family picker ─────────────────────────────────────────────────────
  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div>
          <h2>Family booking</h2>
          <p>Book classes or purchase a term on behalf of a family who can't access the parent portal.</p>
        </div>
      </div>

      <div className="card">
        <span className="label" style={{ display: 'block', marginBottom: 14 }}>Select a family to manage</span>
        <div className="admin-family-picker">
          {families.map(f => {
            const name = FAMILY_NAMES[f.id] ?? f.id;
            const initials = name.split(' ').map(w => w[0]).join('');
            const childCount = f.children.length;
            return (
              <button
                key={f.id}
                className={`admin-family-card ${selectedFamilyId === f.id ? 'selected' : ''}`}
                onClick={() => setSelectedFamilyId(f.id)}
              >
                <div className="profile-drawer-avatar" style={{ width: 42, height: 42, fontSize: 14 }}>{initials}</div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <strong style={{ display: 'block', fontSize: 13 }}>{name}</strong>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{childCount} child{childCount !== 1 ? 'ren' : ''} · {f.id}</span>
                </div>
                {selectedFamilyId === f.id && <Check size={16} style={{ color: 'var(--pink)', flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 20 }}>
          <Button icon={ArrowRight} disabled={!selectedFamilyId} onClick={() => setStep('action')}>
            Continue
          </Button>
        </div>
      </div>

      <div className="card" style={{ background: '#f8faf7', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <Users size={20} style={{ color: 'var(--teal)', flexShrink: 0, marginTop: 2 }} />
        <div>
          <strong style={{ fontSize: 13 }}>Who is this for?</strong>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.6 }}>
            Use this flow to help families who contact you by phone or in person. You can purchase a term on their behalf, book individual classes, and add children to their account — all without them needing to log in.
          </p>
        </div>
      </div>
    </div>
  );
}
