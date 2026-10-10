import { ArrowRight, Check, CircleDollarSign, CreditCard, Plus, Ticket, Users, X } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { dataClient } from '../../../lib/data/client';
import { TermCreditMeter } from '../../../components/domain/TermCreditMeter';
import { qk } from '../../../lib/data/queryKeys';
import { formatMoney } from '../../../lib/utils/money';
import { toAppError } from '../../../lib/data/errors';
import type { Child } from '../../../types/family';
import type { ClassSession } from '../../../types/teacher';

type Step = 'family' | 'action' | 'book-class' | 'term-purchase' | 'done';
type DoneState = { type: 'term' | 'class-credit' | 'class-individual'; familyName: string; childName?: string; subject?: string };

export function AdminFamilyBookingPage() {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>('family');
  const [selectedFamilyId, setSelectedFamilyId] = useState('');
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [bookingMode, setBookingMode] = useState<'term' | 'individual'>('term');
  const [confirmingSession, setConfirmingSession] = useState<ClassSession | null>(null);
  const [doneState, setDoneState] = useState<DoneState | null>(null);
  const [showAddChild, setShowAddChild] = useState(false);
  const [showAddFamily, setShowAddFamily] = useState(false);
  const [newChild, setNewChild] = useState({ givenName: '', familyName: '', year: 'Year 5', school: '' });
  const [newFamily, setNewFamily] = useState({ parentName: '', email: '', phone: '' });
  const [mutError, setMutError] = useState('');

  const { data: families = [], isLoading: loadingFamilies } = useQuery({
    queryKey: qk.families,
    queryFn: () => dataClient.getAllFamilies(),
  });

  const { data: children = [] } = useQuery({
    queryKey: qk.children(selectedFamilyId),
    queryFn: () => dataClient.getChildren(selectedFamilyId),
    enabled: !!selectedFamilyId,
  });

  const { data: gating } = useQuery({
    queryKey: ['gating', selectedFamilyId],
    queryFn: () => dataClient.getGating(selectedFamilyId),
    enabled: !!selectedFamilyId,
  });

  const { data: terms = [] } = useQuery({
    queryKey: qk.terms(selectedFamilyId),
    queryFn: () => dataClient.getTerms(selectedFamilyId),
    enabled: !!selectedFamilyId,
  });

  const { data: sessions = [], isLoading: loadingSessions } = useQuery({
    queryKey: qk.sessions(),
    queryFn: () => dataClient.getUpcomingSessions(),
    enabled: step === 'book-class',
  });

  const { data: quote } = useQuery({
    queryKey: qk.quote('term', selectedFamilyId),
    queryFn: () => dataClient.getPriceQuote!('term', selectedFamilyId),
    enabled: !!selectedFamilyId && step === 'term-purchase',
  });

  const enrolledChildren = children.filter(c => c.enrolled);
  const activeTerm = terms.find(t => new Date(t.end_date) > new Date());
  const gatingState = gating?.state ?? 'NO_TERM_EVER';
  const familyName = families.find(f => f.id === selectedFamilyId)?.parent_name ?? selectedFamilyId;

  const { mutate: purchaseTerm, isPending: purchasingTerm } = useMutation({
    mutationFn: () => dataClient.adminRecordPayment!({ familyId: selectedFamilyId, type: 'term' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.terms(selectedFamilyId) });
      qc.invalidateQueries({ queryKey: ['gating', selectedFamilyId] });
      qc.invalidateQueries({ queryKey: qk.allPayments });
      qc.invalidateQueries({ queryKey: qk.adminStats });
      setDoneState({ type: 'term', familyName });
      setStep('done');
    },
    onError: (e) => setMutError(toAppError(e).message),
  });

  const { mutate: bookClass, isPending: bookingClass } = useMutation({
    mutationFn: async (session: ClassSession) => {
      if (!selectedChild) throw new Error('No child selected');
      if (bookingMode === 'term') {
        return dataClient.bookClassSession(selectedChild.id, session.id);
      } else {
        return dataClient.adminRecordPayment!({ familyId: selectedFamilyId, type: 'individual_class', childId: selectedChild.id, sessionId: session.id });
      }
    },
    onSuccess: (_, session) => {
      qc.invalidateQueries({ queryKey: qk.terms(selectedFamilyId) });
      qc.invalidateQueries({ queryKey: ['gating', selectedFamilyId] });
      qc.invalidateQueries({ queryKey: qk.bookings(selectedFamilyId) });
      qc.invalidateQueries({ queryKey: qk.allBookings });
      qc.invalidateQueries({ queryKey: qk.sessions() });
      setDoneState({ type: bookingMode === 'term' ? 'class-credit' : 'class-individual', familyName, childName: selectedChild?.name, subject: session.subject });
      setConfirmingSession(null);
      setStep('done');
    },
    onError: (e) => setMutError(toAppError(e).message),
  });

  const { mutate: addChild, isPending: addingChild } = useMutation({
    mutationFn: () => dataClient.addChild(selectedFamilyId, { givenName: newChild.givenName.trim(), familyName: newChild.familyName.trim(), year: newChild.year, school: newChild.school }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.children(selectedFamilyId) });
      setShowAddChild(false);
      setNewChild({ givenName: '', familyName: '', year: 'Year 5', school: '' });
    },
    onError: (e) => setMutError(toAppError(e).message),
  });

  const { mutate: markEnrolled, isPending: enrolling } = useMutation({
    mutationFn: (childId: string) => dataClient.adminMarkEnrolled!(childId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.children(selectedFamilyId) }),
    onError: (e) => setMutError(toAppError(e).message),
  });

  const { mutate: createFamily, isPending: creatingFamily } = useMutation({
    mutationFn: () => dataClient.createFamily!({ parentName: newFamily.parentName.trim(), email: newFamily.email.trim() || undefined, phone: newFamily.phone.trim() || undefined }),
    onSuccess: (f) => {
      qc.invalidateQueries({ queryKey: qk.families });
      setSelectedFamilyId(f.id);
      setShowAddFamily(false);
      setNewFamily({ parentName: '', email: '', phone: '' });
      setStep('action');
    },
    onError: (e) => setMutError(toAppError(e).message),
  });

  function reset() { setStep('family'); setSelectedFamilyId(''); setSelectedChild(null); setBookingMode('term'); setDoneState(null); setMutError(''); }

  if (step === 'done' && doneState) {
    return (
      <div className="page-stack">
        <div className="card" style={{ textAlign: 'center', padding: '48px 32px' }}>
          <div className="success-mark" style={{ margin: '0 auto 20px' }}><Check size={26} /></div>
          <h2 style={{ fontSize: 26, marginBottom: 10 }}>
            {doneState.type === 'term' ? 'Term activated!' : 'Class booked!'}
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, maxWidth: 380, margin: '0 auto 28px' }}>
            {doneState.type === 'term' && `${doneState.familyName}'s account is now active for this term. All classes have been booked automatically.`}
            {doneState.type === 'class-credit' && `${doneState.childName}'s ${doneState.subject} class has been confirmed using a term credit.`}
            {doneState.type === 'class-individual' && `${doneState.childName}'s ${doneState.subject} class has been confirmed and recorded as paid.`}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button onClick={() => { setStep('action'); setDoneState(null); }} icon={ArrowRight}>Do more for {doneState.familyName.split(' ')[0]}</Button>
            <Button variant="soft" onClick={reset}>Start over</Button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'term-purchase') {
    return (
      <div className="page-stack">
        <div className="page-toolbar">
          <div><h2>Purchase term — {familyName}</h2><p>Record a term payment on behalf of this family. Activated immediately.</p></div>
          <Button variant="ghost" onClick={() => setStep('action')}>← Back</Button>
        </div>
        <div className="card invoice" style={{ maxWidth: 560 }}>
          <div className="invoice-head">
            <div><span className="label">Admin — on behalf of {familyName}</span><h3>10-week term package</h3></div>
          </div>
          {quote && (<>
            <div className="invoice-line"><span>10-week term</span><b>{formatMoney(quote.base_cents)}</b></div>
            {quote.registration_cents > 0 && <div className="invoice-line"><span>Registration fee</span><b>{formatMoney(quote.registration_cents)}</b></div>}
            <div className="divider" />
            <div className="invoice-line"><span>Subtotal</span><b>{formatMoney(quote.amount_cents)}</b></div>
            <div className="invoice-line"><span>GST (10%)</span><b>{formatMoney(quote.gst_cents)}</b></div>
            <div className="divider" />
            <div className="invoice-line total"><span>Total</span><b>{formatMoney(quote.total_cents)} AUD</b></div>
          </>)}
          <div className="admin-booking-note">
            <CircleDollarSign size={16} />
            <span>This will immediately activate a new term for {familyName}. All sessions in the term window will be auto-booked for enrolled children.</span>
          </div>
          {mutError && <p className="auth-error">{mutError}</p>}
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

  if (step === 'book-class') {
    return (
      <div className="page-stack">
        <div className="page-toolbar">
          <div><h2>Book a class — {familyName}</h2><p>Select a child and class to book on behalf of this family.</p></div>
          <Button variant="ghost" onClick={() => setStep('action')}>← Back</Button>
        </div>

        <div className="card">
          <span className="label" style={{ display: 'block', marginBottom: 10 }}>Select child</span>
          {enrolledChildren.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>No enrolled children.</p>}
          <div className="child-switcher" style={{ marginBottom: 12 }}>
            {enrolledChildren.map(c => (
              <button key={c.id} className={selectedChild?.id === c.id ? 'active' : ''} onClick={() => setSelectedChild(c)}>
                <span className="switcher-avatar">{c.initials}</span>
                <span className="switcher-name">{c.givenName}</span>
              </button>
            ))}
            {children.filter(c => !c.enrolled).map(c => (
              <button key={c.id} style={{ opacity: 0.5 }} title="Not enrolled" onClick={() => markEnrolled(c.id)} disabled={enrolling}>
                <span className="switcher-avatar">{c.initials}</span>
                <span className="switcher-name">{c.givenName} (enrol)</span>
              </button>
            ))}
            <button onClick={() => setShowAddChild(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f4f7f3', border: '1px dashed var(--line)', borderRadius: 11, padding: '9px 14px', fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
              <Plus size={14} /> Add child
            </button>
          </div>
        </div>

        {activeTerm && <TermCreditMeter term={activeTerm} />}

        {selectedChild && (
          <div className="booking-mode-toggle">
            <span className="booking-mode-label">Booking method</span>
            <div className="booking-mode-options">
              <button
                className={`booking-mode-btn ${bookingMode === 'term' ? 'active' : ''} ${gatingState !== 'ACTIVE_TERM' ? 'disabled' : ''}`}
                onClick={() => gatingState === 'ACTIVE_TERM' && setBookingMode('term')}
              >
                <Ticket size={16} />
                <div>
                  <strong>Term booking</strong>
                  <span>{gatingState === 'ACTIVE_TERM' ? 'Auto-booked via term' : 'No active term'}</span>
                </div>
                {bookingMode === 'term' && gatingState === 'ACTIVE_TERM' && <Check size={15} className="mode-check" />}
              </button>
              <button className={`booking-mode-btn ${bookingMode === 'individual' ? 'active' : ''}`} onClick={() => setBookingMode('individual')}>
                <CreditCard size={16} />
                <div><strong>Individual class</strong><span>Recorded as paid immediately</span></div>
                {bookingMode === 'individual' && <Check size={15} className="mode-check" />}
              </button>
            </div>
          </div>
        )}

        {selectedChild && (
          <div className="classes-list">
            {loadingSessions && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading sessions…</p>}
            {sessions.map(session => {
              const isFull = session.spaces_left === 0;
              const canBook = !isFull && (bookingMode === 'individual' || gatingState === 'ACTIVE_TERM');
              const d = new Date(session.starts_at);
              return (
                <div className={`class-card ${session.program_color ?? 'pink'}`} key={session.id}>
                  <div className="class-card-top">
                    <span className="class-subject">{session.subject.toUpperCase()}</span>
                    <span className={`space-badge ${isFull ? 'full-badge' : ''}`}>{isFull ? 'FULL' : `${session.spaces_left} spaces`}</span>
                  </div>
                  <div className="class-card-when">
                    <h3>{d.toLocaleDateString('en-AU', { weekday: 'long' })}</h3>
                    <span>{d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}</span>
                  </div>
                  <div className="class-tutor">
                    <div className={`mini-avatar ${session.teacher_color}-bg`}>{session.teacher_name.split(' ').map(w => w[0]).join('')}</div>
                    <span>with <b>{session.teacher_name}</b></span>
                  </div>
                  {canBook
                    ? <Button onClick={() => { setConfirmingSession(session); setMutError(''); }} icon={Check}>Book for {selectedChild.givenName}</Button>
                    : <Button variant="soft" disabled>{isFull ? 'Class full' : 'Not available'}</Button>}
                </div>
              );
            })}
            {!loadingSessions && sessions.length === 0 && (
              <div className="card" style={{ textAlign: 'center', padding: '24px' }}>
                <p style={{ color: 'var(--muted)', fontSize: 13 }}>No upcoming sessions available.</p>
              </div>
            )}
          </div>
        )}

        {confirmingSession && (
          <div className="modal-backdrop" onClick={() => setConfirmingSession(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setConfirmingSession(null)}><X size={18} /></button>
              <div className="modal-icon"><Check size={22} /></div>
              <h2>Confirm booking</h2>
              <p>Booking on behalf of <strong>{familyName}</strong>.</p>
              <div className="review-details">
                <div className="review-detail-row"><span>Child</span><b>{selectedChild?.name}</b></div>
                <div className="review-detail-row"><span>Subject</span><b>{confirmingSession.subject}</b></div>
                <div className="review-detail-row"><span>Date</span><b>{new Date(confirmingSession.starts_at).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}</b></div>
                <div className="review-detail-row"><span>Time</span><b>{new Date(confirmingSession.starts_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}</b></div>
                <div className="review-detail-row"><span>Tutor</span><b>{confirmingSession.teacher_name}</b></div>
                <div className="review-detail-row"><span>Cost</span><b>{bookingMode === 'term' ? 'Term booking' : 'Individual — recorded as paid'}</b></div>
              </div>
              {mutError && <p className="auth-error">{mutError}</p>}
              <Button icon={Check} onClick={() => bookClass(confirmingSession)} disabled={bookingClass}>
                {bookingClass ? 'Booking…' : 'Confirm booking'}
              </Button>
              <button className="modal-cancel" onClick={() => setConfirmingSession(null)}>Cancel</button>
            </div>
          </div>
        )}

        {showAddChild && (
          <div className="modal-backdrop" onClick={() => setShowAddChild(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setShowAddChild(false)}><X size={18} /></button>
              <div className="modal-icon"><Plus size={22} /></div>
              <h2>Add child</h2>
              <div className="add-modal-form">
                <label>Given name<input value={newChild.givenName} onChange={e => setNewChild(s => ({ ...s, givenName: e.target.value }))} placeholder="e.g. Emma" /></label>
                <label>Family name<input value={newChild.familyName} onChange={e => setNewChild(s => ({ ...s, familyName: e.target.value }))} placeholder="e.g. Johnson" /></label>
                <label>Year level<select value={newChild.year} onChange={e => setNewChild(s => ({ ...s, year: e.target.value }))}>{['Year 1','Year 2','Year 3','Year 4','Year 5','Year 6'].map(y => <option key={y}>{y}</option>)}</select></label>
                <label>School<input value={newChild.school} onChange={e => setNewChild(s => ({ ...s, school: e.target.value }))} placeholder="e.g. Riverside Primary" /></label>
              </div>
              <div className="review-actions">
                <Button variant="ghost" onClick={() => setShowAddChild(false)} icon={X}>Cancel</Button>
                <Button icon={Check} onClick={() => addChild()} disabled={!newChild.givenName.trim() || addingChild}>
                  {addingChild ? 'Saving…' : 'Add child'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (step === 'action') {
    return (
      <div className="page-stack">
        <div className="page-toolbar">
          <div><h2>What would you like to do?</h2><p>Managing account for <strong>{familyName}</strong></p></div>
          <Button variant="ghost" onClick={reset}>← Change family</Button>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="profile-drawer-avatar" style={{ width: 46, height: 46, fontSize: 15 }}>
            {familyName.split(' ').map(w => w[0]).join('')}
          </div>
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: 15 }}>{familyName}</strong>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
              {enrolledChildren.length} enrolled child{enrolledChildren.length !== 1 ? 'ren' : ''} ·{' '}
              {gatingState === 'ACTIVE_TERM' ? `Active term` : gatingState === 'TERM_EXPIRED' ? 'Term expired' : 'No term'}
            </p>
          </div>
          <span className={`table-status ${gatingState === 'ACTIVE_TERM' ? 'confirmed' : 'pending'}`}>
            {gatingState === 'ACTIVE_TERM' ? 'Active term' : gatingState === 'TERM_EXPIRED' ? 'Expired' : 'No term'}
          </span>
        </div>
        {activeTerm && <TermCreditMeter term={activeTerm} />}
        <div className="admin-booking-actions">
          <button className="admin-booking-action-card" onClick={() => setStep('book-class')}>
            <div className="admin-booking-action-icon teal-bg"><Ticket size={22} /></div>
            <strong>Book a class</strong>
            <span>Reserve a spot using a term credit or individual payment.</span>
            <div className="admin-booking-action-arrow"><ArrowRight size={16} /></div>
          </button>
          <button className="admin-booking-action-card" onClick={() => setStep('term-purchase')} disabled={gatingState === 'ACTIVE_TERM'}>
            <div className="admin-booking-action-icon pink-bg"><CircleDollarSign size={22} /></div>
            <strong>{gatingState === 'ACTIVE_TERM' ? 'Term already active' : 'Purchase a term'}</strong>
            <span>{gatingState === 'ACTIVE_TERM' ? 'Classes are auto-booked for this term.' : 'Activate a 10-week term immediately.'}</span>
            <div className="admin-booking-action-arrow"><ArrowRight size={16} /></div>
          </button>
        </div>
      </div>
    );
  }

  // Family picker
  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div><h2>Family booking</h2><p>Book classes or purchase a term on behalf of a family.</p></div>
        <Button icon={Plus} onClick={() => setShowAddFamily(true)}>New family</Button>
      </div>
      <div className="card">
        <span className="label" style={{ display: 'block', marginBottom: 14 }}>Select a family to manage</span>
        {loadingFamilies && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</p>}
        <div className="admin-family-picker">
          {families.map(f => (
            <button key={f.id} className={`admin-family-card ${selectedFamilyId === f.id ? 'selected' : ''}`} onClick={() => setSelectedFamilyId(f.id)}>
              <div className="profile-drawer-avatar" style={{ width: 42, height: 42, fontSize: 14 }}>{f.parent_name.split(' ').map(w => w[0]).join('')}</div>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <strong style={{ display: 'block', fontSize: 13 }}>{f.parent_name}</strong>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{f.reference_code}</span>
              </div>
              {selectedFamilyId === f.id && <Check size={16} style={{ color: 'var(--pink)', flexShrink: 0 }} />}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 20 }}>
          <Button icon={ArrowRight} disabled={!selectedFamilyId} onClick={() => setStep('action')}>Continue</Button>
        </div>
      </div>

      <div className="card" style={{ background: '#f8faf7', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <Users size={20} style={{ color: 'var(--teal)', flexShrink: 0, marginTop: 2 }} />
        <div>
          <strong style={{ fontSize: 13 }}>Who is this for?</strong>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.6 }}>
            Use this flow to help families who contact you by phone or in person — without them needing to log in.
          </p>
        </div>
      </div>

      {showAddFamily && (
        <div className="modal-backdrop" onClick={() => setShowAddFamily(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowAddFamily(false)}><X size={18} /></button>
            <div className="modal-icon"><Users size={22} /></div>
            <h2>New family</h2>
            <p>Create a family account without portal access.</p>
            <div className="add-modal-form">
              <label>Parent name<input value={newFamily.parentName} onChange={e => setNewFamily(s => ({ ...s, parentName: e.target.value }))} placeholder="e.g. Rebecca Martin" /></label>
              <label>Email (optional)<input value={newFamily.email} onChange={e => setNewFamily(s => ({ ...s, email: e.target.value }))} placeholder="e.g. rebecca@email.com" /></label>
              <label>Phone (optional)<input value={newFamily.phone} onChange={e => setNewFamily(s => ({ ...s, phone: e.target.value }))} placeholder="e.g. 0400 123 456" /></label>
            </div>
            <div className="review-actions">
              <Button variant="ghost" onClick={() => setShowAddFamily(false)} icon={X}>Cancel</Button>
              <Button icon={Check} onClick={() => createFamily()} disabled={!newFamily.parentName.trim() || creatingFamily}>
                {creatingFamily ? 'Creating…' : 'Create family'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
