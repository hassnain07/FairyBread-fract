import { ArrowRight, Check } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { Confetti } from '../../../components/ui/Sprinkles';
import { dataClient } from '../../../lib/data/client';
import { useAuth } from '../../../app/providers';

const steps = ['Parent', 'Child', 'Terms', 'Signature', 'Complete'];

const REFERRAL_OPTIONS = ['Word of mouth', 'Google', 'Social media', 'School newsletter', 'Other'];

export function EnrolmentPage() {
  const navigate = useNavigate();
  const { familyId } = useAuth();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [signature, setSignature] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [agreedToTrampoline, setAgreedToTrampoline] = useState(false);

  // Parent details
  const [parent, setParent] = useState({
    familyName: '',
    givenName: '',
    relationship: '',
    address: '',
    email: '',
    phone1: '',
    phone2: '',
    emergencyName: '',
    emergencyRelationship: '',
    emergencyPhone: '',
  });
  const [signatureDate, setSignatureDate] = useState(
    new Date().toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })
  );

  // Child details (editable during enrolment)
  const [childDetails, setChildDetails] = useState({
    familyName: '',
    givenName: '',
    preferredName: '',
    year: '',
    school: '',
    concern: '',
  });

  // Referral
  const [referral, setReferral] = useState('Word of mouth');

  // Child selection — fetched from real data
  const { data: children = [] } = useQuery({
    queryKey: ['children', familyId],
    queryFn: () => dataClient.getChildren(familyId),
  });
  const [selectedChildId, setSelectedChildId] = useState('');
  const selectedChild = children.find(c => c.id === selectedChildId) ?? null;

  function selectChild(id: string) {
    setSelectedChildId(id);
    const c = children.find(ch => ch.id === id);
    if (c) {
      const parts = c.name.split(' ');
      setChildDetails({
        familyName: parts.slice(1).join(' '),
        givenName: parts[0] ?? '',
        preferredName: c.preferredName ?? '',
        year: c.year,
        school: c.school,
        concern: c.concern ?? '',
      });
    }
  }

  const { data: docs = {} } = useQuery({
    queryKey: ['documents'],
    queryFn: () => dataClient.getDocuments(),
  });

  function openDoc(key: string, fallback: string) {
    return (e: React.MouseEvent) => {
      e.stopPropagation();
      if (docs[key]) {
        window.open(docs[key], '_blank', 'noopener,noreferrer');
      } else {
        alert(`${fallback} has not been uploaded yet. Please contact us.`);
      }
    };
  }

  const firstName = childDetails.preferredName.trim() || childDetails.givenName.trim() || selectedChild?.name.split(' ')[0] || 'your child';

  const canProceedStep2 = !!selectedChild && childDetails.givenName.trim().length > 0;
  const canProceedStep3 = agreedToTerms && agreedToPrivacy && agreedToTrampoline;
  const canComplete = signature.trim().length > 2;

  const completeEnrolment = () => {
    if (!selectedChild) return;
    const fullName = `${childDetails.givenName.trim()} ${childDetails.familyName.trim()}`.trim();
    const updated = {
      ...selectedChild,
      name: fullName || selectedChild.name,
      initials: [childDetails.givenName[0], childDetails.familyName[0]].filter(Boolean).join('').toUpperCase() || selectedChild.initials,
      familyName: childDetails.familyName,
      givenName: childDetails.givenName,
      preferredName: childDetails.preferredName,
      year: childDetails.year,
      school: childDetails.school,
      concern: childDetails.concern,
      enrolled: true,
    };
    dataClient.addChild(familyId, updated).then(() => {
      qc.invalidateQueries({ queryKey: ['children', familyId] });
    });
    setStep(5);
  };

  return (
    <div className="page-stack narrow-page">
      <div className="enrolment-head">
        <div className="eyebrow">A few lovely details</div>
        <h2>Let's make it official.</h2>
        <p>
          {selectedChild
            ? `We'll use these details to set up ${firstName}'s enrolment.`
            : "We'll use these details to set up your child's enrolment."}
        </p>
      </div>

      <div className="stepper">
        {steps.map((s, i) => (
          <div className={step === i + 1 ? 'active' : step > i + 1 ? 'done' : ''} key={s}>
            <span>{step > i + 1 ? <Check size={14} /> : i + 1}</span>{s}
          </div>
        ))}
      </div>

      <div className="card form-card">

        {/* ── Step 1: Parent / Guardian details ── */}
        {step === 1 && (
          <>
            <span className="label">Enrolling Parent / Guardian</span>
            <h3>Tell us about you</h3>
            <div className="form-grid">
              <label>Family name<input value={parent.familyName} onChange={e => setParent({ ...parent, familyName: e.target.value })} placeholder="Family name" /></label>
              <label>Given name<input value={parent.givenName} onChange={e => setParent({ ...parent, givenName: e.target.value })} placeholder="Given name" /></label>
              <label>Relationship to student<input value={parent.relationship} onChange={e => setParent({ ...parent, relationship: e.target.value })} placeholder="e.g. Mother, Father, Guardian" /></label>
              <label style={{ gridColumn: '1 / -1' }}>Address<input value={parent.address} onChange={e => setParent({ ...parent, address: e.target.value })} placeholder="Street address" /></label>
              <label style={{ gridColumn: '1 / -1' }}>Email<input type="email" value={parent.email} onChange={e => setParent({ ...parent, email: e.target.value })} placeholder="your@email.com" /></label>
              <label>Phone 1<input value={parent.phone1} onChange={e => setParent({ ...parent, phone1: e.target.value })} placeholder="04xx xxx xxx" /></label>
              <label>Phone 2<input value={parent.phone2} onChange={e => setParent({ ...parent, phone2: e.target.value })} placeholder="Optional" /></label>
            </div>

            <div className="enrol-section-divider">
              <span>Emergency Contact Details</span>
              <small>If parent or guardian cannot be contacted</small>
            </div>
            <div className="form-grid">
              <label style={{ gridColumn: '1 / -1' }}>Name<input value={parent.emergencyName} onChange={e => setParent({ ...parent, emergencyName: e.target.value })} placeholder="Full name" /></label>
              <label>Relationship to child<input value={parent.emergencyRelationship} onChange={e => setParent({ ...parent, emergencyRelationship: e.target.value })} placeholder="e.g. Grandparent, Aunt" /></label>
              <label>Mobile / Phone<input value={parent.emergencyPhone} onChange={e => setParent({ ...parent, emergencyPhone: e.target.value })} placeholder="04xx xxx xxx" /></label>
            </div>

            <div className="form-actions">
              <span />
              <Button onClick={() => setStep(2)} icon={ArrowRight}>Continue</Button>
            </div>
          </>
        )}

        {/* ── Step 2: Student personal details ── */}
        {step === 2 && (
          <>
            <span className="label">Student personal details</span>
            <h3>Who are we enrolling?</h3>
            <p className="step-intro">Select a child from your account, then confirm or fill in their details.</p>

            <div className="enrol-child-select">
              <label>Select child
                <select value={selectedChildId} onChange={e => selectChild(e.target.value)}>
                  <option value="">— Choose a child —</option>
                  {children.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
            </div>

            {selectedChild && (
              <div className="form-grid" style={{ marginTop: 18 }}>
                <label>Family name<input value={childDetails.familyName} onChange={e => setChildDetails({ ...childDetails, familyName: e.target.value })} placeholder="Family name" /></label>
                <label>Given name<input value={childDetails.givenName} onChange={e => setChildDetails({ ...childDetails, givenName: e.target.value })} placeholder="Given name" /></label>
                <label>Preferred name<input value={childDetails.preferredName} onChange={e => setChildDetails({ ...childDetails, preferredName: e.target.value })} placeholder="What they like to be called" /></label>
                <label>Grade at school this year<input value={childDetails.year} onChange={e => setChildDetails({ ...childDetails, year: e.target.value })} placeholder="e.g. Year 4" /></label>
                <label style={{ gridColumn: '1 / -1' }}>School currently attending<input value={childDetails.school} onChange={e => setChildDetails({ ...childDetails, school: e.target.value })} placeholder="School name" /></label>
                <label style={{ gridColumn: '1 / -1' }}>
                  Parents / School concern
                  <textarea
                    value={childDetails.concern}
                    onChange={e => setChildDetails({ ...childDetails, concern: e.target.value })}
                    placeholder="Describe any learning concerns or areas you'd like us to focus on"
                    rows={3}
                  />
                </label>
              </div>
            )}

            {!selectedChild && children.length === 0 && (
              <div className="enrol-no-children">
                <p>No children found on your account. Add a child first from <button className="text-link" onClick={() => navigate('/parent/children')}>My children</button>.</p>
              </div>
            )}

            <div className="form-actions">
              <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
              <Button disabled={!canProceedStep2} onClick={() => setStep(3)} icon={ArrowRight}>Continue</Button>
            </div>
          </>
        )}

        {/* ── Step 3: Terms, Privacy & Consents ── */}
        {step === 3 && (
          <>
            <span className="label">Agreements &amp; consents</span>
            <h3>Almost there!</h3>
            <p className="step-intro">Please read and agree to the following before completing enrolment.</p>

            <div className="form-grid" style={{ marginBottom: 20 }}>
              <label style={{ gridColumn: '1 / -1' }}>
                How did you hear about us?
                <select value={referral} onChange={e => setReferral(e.target.value)}>
                  {REFERRAL_OPTIONS.map(r => <option key={r}>{r}</option>)}
                </select>
              </label>
            </div>

            <div className="enrol-terms-check" onClick={() => setAgreedToTerms(v => !v)}>
              <span className={`goal-check ${agreedToTerms ? 'done' : ''}`}>{agreedToTerms && <Check size={13} />}</span>
              <span>I have read and agree to the <a href="#" onClick={openDoc('terms', 'Terms & Conditions')}>Fairybread &amp; Fractions Terms &amp; Conditions</a></span>
            </div>

            <div className="enrol-terms-check" onClick={() => setAgreedToPrivacy(v => !v)}>
              <span className={`goal-check ${agreedToPrivacy ? 'done' : ''}`}>{agreedToPrivacy && <Check size={13} />}</span>
              <span>I have read and agree to the <a href="#" onClick={openDoc('privacy', 'Privacy Policy')}>Fairybread &amp; Fractions Privacy Policy</a></span>
            </div>

            <div className="enrol-terms-check" onClick={() => setAgreedToTrampoline(v => !v)}>
              <span className={`goal-check ${agreedToTrampoline ? 'done' : ''}`}>{agreedToTrampoline && <Check size={13} />}</span>
              <span>I have read and accept the <a href="#" onClick={openDoc('mini_trampoline', 'Mini Trampoline Consent Form')}>Mini Trampoline Consent Form</a></span>
            </div>

            <div className="form-actions">
              <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
              <Button disabled={!canProceedStep3} onClick={() => setStep(4)} icon={ArrowRight}>Continue</Button>
            </div>
          </>
        )}

        {/* ── Step 4: Signature ── */}
        {step === 4 && (
          <>
            <span className="label">Signature</span>
            <h3>Sign on the dotted line</h3>
            <p className="step-intro">Type your full name below to confirm {firstName}'s enrolment.</p>
            <div className="signature-area">
              <input
                className="signature-input"
                value={signature}
                onChange={e => setSignature(e.target.value)}
                placeholder="Type your full name"
              />
              <div className="signature-line" />
            </div>
            <p className="signature-terms">By signing, you confirm you've read and agreed to the Terms &amp; Conditions, Privacy Policy and Mini Trampoline Consent Form.</p>
            <div className="form-grid" style={{ marginTop: 16 }}>
              <label style={{ gridColumn: '1 / -1' }}>Date<input value={signatureDate} onChange={e => setSignatureDate(e.target.value)} /></label>
            </div>
            <div className="form-actions">
              <Button variant="ghost" onClick={() => setStep(3)}>Back</Button>
              <Button disabled={!canComplete} onClick={completeEnrolment} icon={ArrowRight}>Complete enrolment</Button>
            </div>
          </>
        )}

        {/* ── Step 5: Complete ── */}
        {step === 5 && (
          <div className="complete-state">
            <Confetti />
            <div className="success-mark"><Check size={27} /></div>
            <h2>All set, {parent.givenName || 'there'}.</h2>
            <p>{firstName}'s enrolment is complete. We can't wait to see them shine.</p>
            <Button onClick={() => navigate('/parent/book-class')} icon={ArrowRight}>Explore classes</Button>
          </div>
        )}

      </div>
    </div>
  );
}
