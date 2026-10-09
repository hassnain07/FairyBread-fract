import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../../../app/providers';
import { homeFor } from '../../../app/RequireRole';
import { toAppError } from '../../../lib/data/errors';
import { SprinkleField } from '../../../components/ui/Sprinkles';

function Logo() {
  return (
    <div className="brand brand-compact">
      <img src="/assets/image.png" alt="Fairybread & Fractions" />
      <div><strong>fairybread</strong><span>& fractions</span></div>
    </div>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Redirect already-signed-in users — on /login only
  useEffect(() => {
    if (!loading && user) {
      const from = (location.state as { from?: string })?.from;
      navigate(from ?? homeFor(user.role), { replace: true });
    }
  }, [user, loading, navigate, location.state]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const u = await signIn(email.trim().toLowerCase(), password);
      const from = (location.state as { from?: string })?.from;
      navigate(from ?? homeFor(u.role), { replace: true });
    } catch (err) {
      setError(toAppError(err).message);
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
            <h1>Welcome<br />back <em>✦</em></h1>
            <p>Sign in to your account to manage bookings, track progress, and stay connected.</p>
          </div>
          <div className="auth-role-pills">
            <span className="auth-role-pill pink">Parents</span>
            <span className="auth-role-pill teal">Tutors</span>
            <span className="auth-role-pill yellow">Admin</span>
          </div>
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-form-wrap">
          <div className="auth-form-head">
            <h2>Sign in</h2>
            <p>Enter your credentials below to continue.</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <div className="auth-field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="auth-field">
              <div className="auth-field-row">
                <label htmlFor="password">Password</label>
                <Link to="/forgot-password" className="auth-forgot">Forgot password?</Link>
              </div>
              <div className="auth-pw-wrap">
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <button type="button" className="auth-pw-toggle" onClick={() => setShowPw(v => !v)} tabIndex={-1}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="auth-error">
                <AlertCircle size={15} />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className="auth-submit" disabled={submitting}>
              {submitting
                ? <span className="auth-spinner" />
                : <><span>Sign in</span><ArrowRight size={16} /></>}
            </button>
          </form>

          <p className="auth-switch">
            New family? <Link to="/signup">Create an account</Link>
          </p>
          <p className="auth-back">
            <Link to="/">← Back to website</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
