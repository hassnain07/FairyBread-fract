import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Lock } from 'lucide-react';
import { SprinkleField } from '../../../components/ui/Sprinkles';
import { dataClient } from '../../../lib/data/client';
import { toAppError } from '../../../lib/data/errors';
import { useAuth } from '../../../app/providers';

function Logo() {
  return (
    <div className="brand brand-compact">
      <img src="/assets/image.png" alt="Fairybread & Fractions" />
      <div><strong>fairybread</strong><span>& fractions</span></div>
    </div>
  );
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { user, loading, refresh } = useAuth();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // If there's no session after auth loads, the invite link has expired
  const noSession = !loading && !user;

  useEffect(() => {
    if (done && user) {
      const dest = user.role === 'admin' ? '/admin' : '/teacher';
      navigate(dest, { replace: true });
    }
  }, [done, user, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (password.length < 8) errs.password = 'Password must be at least 8 characters.';
    if (password !== confirm) errs.confirm = 'Passwords do not match.';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setServerError('');
    setSubmitting(true);
    try {
      await dataClient.setPassword!(password);
      await refresh();
      setDone(true);
    } catch (err) {
      setServerError(toAppError(err).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-left">
        <SprinkleField count={18} />
        <div className="auth-left-inner">
          <div className="auth-brand"><Logo /></div>
          <div className="auth-hero-text">
            <h1>Set your<br />password <em>✦</em></h1>
            <p>You've been invited to join the Fairybread &amp; Fractions team. Set a password to activate your account.</p>
          </div>
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-form-wrap">
          {loading && (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <span className="auth-spinner" />
            </div>
          )}

          {noSession && (
            <div className="auth-form-head">
              <h2>Link expired</h2>
              <p>This invite link has expired or has already been used. Ask an admin to resend your invite.</p>
              <Link to="/login" className="auth-submit" style={{ display: 'inline-flex', marginTop: '1rem' }}>
                <span>Go to sign in</span>
              </Link>
            </div>
          )}

          {!loading && user && !done && (
            <>
              <div className="auth-form-head">
                <h2>Set your password</h2>
                <p>Welcome, {user.firstName}. Choose a strong password to get started.</p>
              </div>
              <form className="auth-form" onSubmit={handleSubmit} noValidate>
                <div className="auth-field">
                  <label htmlFor="rp-pw"><Lock size={13} />Password</label>
                  <div className="auth-pw-wrap">
                    <input
                      id="rp-pw"
                      type={showPw ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={e => { setPassword(e.target.value); setErrors(p => ({ ...p, password: undefined })); }}
                    />
                    <button type="button" className="auth-pw-toggle" onClick={() => setShowPw(v => !v)} tabIndex={-1}>
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {errors.password && <span className="auth-field-error">{errors.password}</span>}
                </div>
                <div className="auth-field">
                  <label htmlFor="rp-confirm"><Lock size={13} />Confirm password</label>
                  <div className="auth-pw-wrap">
                    <input
                      id="rp-confirm"
                      type={showConfirm ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Repeat your password"
                      value={confirm}
                      onChange={e => { setConfirm(e.target.value); setErrors(p => ({ ...p, confirm: undefined })); }}
                    />
                    <button type="button" className="auth-pw-toggle" onClick={() => setShowConfirm(v => !v)} tabIndex={-1}>
                      {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {errors.confirm && <span className="auth-field-error">{errors.confirm}</span>}
                </div>
                {serverError && (
                  <div className="auth-error"><span>{serverError}</span></div>
                )}
                <button type="submit" className="auth-submit" disabled={submitting}>
                  {submitting ? <span className="auth-spinner" /> : <><span>Activate account</span><ArrowRight size={16} /></>}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
