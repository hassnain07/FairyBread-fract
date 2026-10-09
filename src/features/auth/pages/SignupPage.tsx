import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight, AlertCircle, Check, User, Mail, Lock, Phone } from 'lucide-react';
import { SprinkleField } from '../../../components/ui/Sprinkles';
import { OtpInput } from '../components/OtpInput';
import { dataClient } from '../../../lib/data/client';
import { toAppError } from '../../../lib/data/errors';

interface SignupForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  agreeTerms: boolean;
}

const EMPTY: SignupForm = {
  firstName: '', lastName: '', email: '', phone: '',
  password: '', confirmPassword: '', agreeTerms: false,
};

function validateDetails(f: SignupForm) {
  const e: Partial<Record<keyof SignupForm, string>> = {};
  if (!f.firstName.trim()) e.firstName = 'First name is required.';
  if (!f.lastName.trim()) e.lastName = 'Last name is required.';
  if (!f.email.includes('@')) e.email = 'Please enter a valid email address.';
  if (f.phone && !/^[\d\s+\-()]{7,}$/.test(f.phone)) e.phone = 'Please enter a valid phone number.';
  return e;
}

function validatePassword(f: SignupForm) {
  const e: Partial<Record<keyof SignupForm, string>> = {};
  if (f.password.length < 8) e.password = 'Password must be at least 8 characters.';
  if (f.password !== f.confirmPassword) e.confirmPassword = 'Passwords do not match.';
  if (!f.agreeTerms) e.agreeTerms = 'You must agree to the terms to continue.';
  return e;
}

const STEPS = ['Your details', 'Verify email', 'Set password', 'All done'];

function Logo() {
  return (
    <div className="brand brand-compact">
      <img src="/assets/image.png" alt="Fairybread & Fractions" />
      <div><strong>fairybread</strong><span>& fractions</span></div>
    </div>
  );
}

function PasswordStrength({ password }: { password: string }) {
  const score = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  if (!password) return null;
  const labels = ['Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['orange', 'yellow', 'teal', 'green'];
  return (
    <div className="pw-strength">
      <div className="pw-strength-bars">
        {[0, 1, 2, 3].map(i => (
          <span key={i} className={`pw-bar ${i < score ? colors[score - 1] : ''}`} />
        ))}
      </div>
      <span className={`pw-label ${colors[score - 1] ?? ''}`}>{labels[score - 1] ?? ''}</span>
    </div>
  );
}

export function SignupPage() {
  const navigate = useNavigate();
  // NOTE: No redirect-if-signed-in effect here — verifyOtp creates a session mid-flow
  // and we must not redirect the user away before the password step.

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<SignupForm>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof SignupForm, string>>>({});
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');

  function set(field: keyof SignupForm, value: string | boolean) {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => ({ ...e, [field]: undefined }));
  }

  async function handleDetails(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateDetails(form);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    setServerError('');
    try {
      await dataClient.requestSignupOtp!({
        email: form.email.trim().toLowerCase(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim() || undefined,
      });
      setStep(1);
    } catch (err) {
      setServerError(toAppError(err).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(code: string) {
    await dataClient.verifyOtp!(form.email.trim().toLowerCase(), code, 'signup');
  }

  async function handleResend() {
    await dataClient.requestSignupOtp!({
      email: form.email.trim().toLowerCase(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim() || undefined,
    });
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    const errs = validatePassword(form);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    setServerError('');
    try {
      await dataClient.setPassword!(form.password);
      setStep(3);
    } catch (err) {
      setServerError(toAppError(err).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-left">
        <SprinkleField count={18} />
        <div className="auth-left-inner">
          <div className="auth-brand"><Logo /></div>
          <div className="auth-hero-text">
            <h1>Join the<br />family <em>✦</em></h1>
            <p>Create your parent account and take the first step towards a more confident, joyful learner.</p>
          </div>
          <div className="auth-steps-preview">
            {STEPS.map((label, i) => (
              <div key={label} className={`auth-step-item ${i < step ? 'done' : i === step ? 'active' : ''}`}>
                <span className="auth-step-num">
                  {i < step ? <Check size={12} /> : i + 1}
                </span>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="auth-trust">
            <div className="avatar-stack">
              <span>SJ</span><span>OW</span><span>+48</span>
            </div>
            <div>
              <strong>Loved by local families</strong>
              <small>Personalised learning that sticks.</small>
            </div>
          </div>
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-form-wrap">

          {/* Step 0 — Personal details */}
          {step === 0 && (
            <>
              <div className="auth-form-head">
                <span className="auth-step-label">Step 1 of 3</span>
                <h2>Your details</h2>
                <p>Tell us a little about yourself.</p>
              </div>
              <form className="auth-form" onSubmit={handleDetails} noValidate>
                <div className="auth-field-row-2">
                  <div className="auth-field">
                    <label htmlFor="firstName"><User size={13} />First name</label>
                    <input id="firstName" type="text" autoComplete="given-name" placeholder="Emma" value={form.firstName} onChange={e => set('firstName', e.target.value)} />
                    {errors.firstName && <span className="auth-field-error">{errors.firstName}</span>}
                  </div>
                  <div className="auth-field">
                    <label htmlFor="lastName"><User size={13} />Last name</label>
                    <input id="lastName" type="text" autoComplete="family-name" placeholder="Johnson" value={form.lastName} onChange={e => set('lastName', e.target.value)} />
                    {errors.lastName && <span className="auth-field-error">{errors.lastName}</span>}
                  </div>
                </div>
                <div className="auth-field">
                  <label htmlFor="su-email"><Mail size={13} />Email address</label>
                  <input id="su-email" type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={e => set('email', e.target.value)} />
                  {errors.email && <span className="auth-field-error">{errors.email}</span>}
                </div>
                <div className="auth-field">
                  <label htmlFor="phone"><Phone size={13} />Phone number <span className="auth-optional">(optional)</span></label>
                  <input id="phone" type="tel" autoComplete="tel" placeholder="04xx xxx xxx" value={form.phone} onChange={e => set('phone', e.target.value)} />
                  {errors.phone && <span className="auth-field-error">{errors.phone}</span>}
                </div>
                {serverError && (
                  <div className="auth-error"><AlertCircle size={15} /><span>{serverError}</span></div>
                )}
                <button type="submit" className="auth-submit" disabled={loading}>
                  {loading ? <span className="auth-spinner" /> : <><span>Continue</span><ArrowRight size={16} /></>}
                </button>
              </form>
              <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
              <p className="auth-back"><Link to="/">← Back to website</Link></p>
            </>
          )}

          {/* Step 1 — Verify OTP */}
          {step === 1 && (
            <OtpInput
              heading="Verify your email"
              subheading={<>We sent a 6-digit code to <strong>{form.email}</strong>. Enter it below.</>}
              stepLabel="Step 2 of 3"
              onVerify={handleVerify}
              onVerified={() => setStep(2)}
              onBack={() => setStep(0)}
              onResend={handleResend}
            />
          )}

          {/* Step 2 — Password */}
          {step === 2 && (
            <>
              <div className="auth-form-head">
                <span className="auth-step-label">Step 3 of 3</span>
                <h2>Set your password</h2>
                <p>Choose a strong password for your account.</p>
              </div>
              <form className="auth-form" onSubmit={handlePassword} noValidate>
                <div className="auth-field">
                  <label htmlFor="su-pw"><Lock size={13} />Password</label>
                  <div className="auth-pw-wrap">
                    <input id="su-pw" type={showPw ? 'text' : 'password'} autoComplete="new-password" placeholder="At least 8 characters" value={form.password} onChange={e => set('password', e.target.value)} />
                    <button type="button" className="auth-pw-toggle" onClick={() => setShowPw(v => !v)} tabIndex={-1}>
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {errors.password && <span className="auth-field-error">{errors.password}</span>}
                  <PasswordStrength password={form.password} />
                </div>
                <div className="auth-field">
                  <label htmlFor="su-confirm"><Lock size={13} />Confirm password</label>
                  <div className="auth-pw-wrap">
                    <input id="su-confirm" type={showConfirm ? 'text' : 'password'} autoComplete="new-password" placeholder="Repeat your password" value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} />
                    <button type="button" className="auth-pw-toggle" onClick={() => setShowConfirm(v => !v)} tabIndex={-1}>
                      {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {errors.confirmPassword && <span className="auth-field-error">{errors.confirmPassword}</span>}
                </div>
                <label className="auth-checkbox">
                  <input type="checkbox" checked={form.agreeTerms} onChange={e => set('agreeTerms', e.target.checked)} />
                  <span>I agree to the <a href="#terms" className="auth-link">Terms of Service</a> and <a href="#privacy" className="auth-link">Privacy Policy</a></span>
                </label>
                {errors.agreeTerms && <span className="auth-field-error">{errors.agreeTerms}</span>}
                {serverError && (
                  <div className="auth-error"><AlertCircle size={15} /><span>{serverError}</span></div>
                )}
                <div className="auth-form-actions">
                  <button type="button" className="auth-back-btn" onClick={() => setStep(1)}>← Back</button>
                  <button type="submit" className="auth-submit" disabled={loading}>
                    {loading ? <span className="auth-spinner" /> : <><span>Create account</span><ArrowRight size={16} /></>}
                  </button>
                </div>
              </form>
            </>
          )}

          {/* Step 3 — Success */}
          {step === 3 && (
            <div className="auth-success">
              <div className="auth-success-icon">
                <Check size={28} />
              </div>
              <h2>You're in! 🎉</h2>
              <p>Your account has been created. Welcome to the Fairybread &amp; Fractions family.</p>
              <div className="auth-success-next">
                <strong>What's next?</strong>
                <ul>
                  <li><Check size={12} />Book a free assessment for your child</li>
                  <li><Check size={12} />Complete your enrolment profile</li>
                  <li><Check size={12} />Choose your first term or class</li>
                </ul>
              </div>
              <button className="auth-submit" onClick={() => navigate('/parent')}>
                <span>Go to my portal</span><ArrowRight size={16} />
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
