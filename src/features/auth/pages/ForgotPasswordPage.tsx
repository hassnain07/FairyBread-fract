import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, Check, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { SprinkleField } from '../../../components/ui/Sprinkles';
import { OtpInput } from '../components/OtpInput';

const STEPS = ['Enter email', 'Verify code', 'New password', 'Done'];

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

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwErrors, setPwErrors] = useState<{ password?: string; confirm?: string }>({});
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes('@')) { setEmailError('Please enter a valid email address.'); return; }
    setEmailError('');
    setLoading(true);
    // TODO: supabase.auth.resetPasswordForEmail(email) or signInWithOtp({ email })
    await new Promise(r => setTimeout(r, 700));
    setLoading(false);
    setStep(1); // always advance — no enumeration
  }

  async function handleResend() {
    // TODO: re-send OTP via Supabase
    await new Promise(r => setTimeout(r, 500));
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: { password?: string; confirm?: string } = {};
    if (password.length < 8) errs.password = 'Password must be at least 8 characters.';
    if (password !== confirmPassword) errs.confirm = 'Passwords do not match.';
    if (Object.keys(errs).length) { setPwErrors(errs); return; }
    setPwErrors({});
    setLoading(true);
    // TODO: supabase.auth.updateUser({ password })
    await new Promise(r => setTimeout(r, 800));
    setLoading(false);
    setStep(3);
  }

  return (
    <div className="auth-shell">
      <div className="auth-left">
        <SprinkleField count={18} />
        <div className="auth-left-inner">
          <div className="auth-brand"><Logo /></div>
          <div className="auth-hero-text">
            <h1>Reset your<br />password <em>✦</em></h1>
            <p>We'll send a verification code to your email so you can set a new password safely.</p>
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
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-form-wrap">

          {/* Step 0 — Enter email */}
          {step === 0 && (
            <>
              <div className="auth-form-head">
                <span className="auth-step-label">Step 1 of 3</span>
                <h2>Forgot your password?</h2>
                <p>Enter your email and we'll send you a verification code.</p>
              </div>
              <form className="auth-form" onSubmit={handleEmailSubmit} noValidate>
                <div className="auth-field">
                  <label htmlFor="fp-email"><Mail size={13} />Email address</label>
                  <input
                    id="fp-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setEmailError(''); }}
                  />
                  {emailError && <span className="auth-field-error">{emailError}</span>}
                </div>
                <button type="submit" className="auth-submit" disabled={loading}>
                  {loading ? <span className="auth-spinner" /> : <><span>Send code</span><ArrowRight size={16} /></>}
                </button>
              </form>
              <p className="auth-switch">Remember it? <Link to="/login">Sign in</Link></p>
              <p className="auth-back"><Link to="/">← Back to website</Link></p>
            </>
          )}

          {/* Step 1 — Verify OTP */}
          {step === 1 && (
            <OtpInput
              heading="Check your email"
              subheading={<>We sent a 6-digit code to <strong>{email}</strong>. Enter it below.</>}
              stepLabel="Step 2 of 3"
              onVerified={() => setStep(2)}
              onBack={() => setStep(0)}
              onResend={handleResend}
            />
          )}

          {/* Step 2 — New password */}
          {step === 2 && (
            <>
              <div className="auth-form-head">
                <span className="auth-step-label">Step 3 of 3</span>
                <h2>Set a new password</h2>
                <p>Choose a strong password for your account.</p>
              </div>
              <form className="auth-form" onSubmit={handlePasswordSubmit} noValidate>
                <div className="auth-field">
                  <label htmlFor="fp-pw"><Lock size={13} />New password</label>
                  <div className="auth-pw-wrap">
                    <input
                      id="fp-pw"
                      type={showPw ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={e => { setPassword(e.target.value); setPwErrors(p => ({ ...p, password: undefined })); }}
                    />
                    <button type="button" className="auth-pw-toggle" onClick={() => setShowPw(v => !v)} tabIndex={-1}>
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {pwErrors.password && <span className="auth-field-error">{pwErrors.password}</span>}
                  <PasswordStrength password={password} />
                </div>
                <div className="auth-field">
                  <label htmlFor="fp-confirm"><Lock size={13} />Confirm new password</label>
                  <div className="auth-pw-wrap">
                    <input
                      id="fp-confirm"
                      type={showConfirm ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Repeat your password"
                      value={confirmPassword}
                      onChange={e => { setConfirmPassword(e.target.value); setPwErrors(p => ({ ...p, confirm: undefined })); }}
                    />
                    <button type="button" className="auth-pw-toggle" onClick={() => setShowConfirm(v => !v)} tabIndex={-1}>
                      {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {pwErrors.confirm && <span className="auth-field-error">{pwErrors.confirm}</span>}
                </div>
                <div className="auth-form-actions">
                  <button type="button" className="auth-back-btn" onClick={() => setStep(1)}>← Back</button>
                  <button type="submit" className="auth-submit" disabled={loading}>
                    {loading ? <span className="auth-spinner" /> : <><span>Update password</span><ArrowRight size={16} /></>}
                  </button>
                </div>
              </form>
            </>
          )}

          {/* Step 3 — Done */}
          {step === 3 && (
            <div className="auth-success">
              <div className="auth-success-icon">
                <Check size={28} />
              </div>
              <h2>Password updated!</h2>
              <p>Your password has been reset successfully. You can now sign in with your new password.</p>
              <button className="auth-submit" onClick={() => navigate('/login')}>
                <span>Sign in now</span><ArrowRight size={16} />
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
