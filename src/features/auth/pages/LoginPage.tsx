import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../../../app/providers';
import { SprinkleField } from '../../../components/ui/Sprinkles';

// Mock credential map — replace with Supabase auth + profiles table lookup
const MOCK_CREDENTIALS: Record<string, { password: string; role: 'parent' | 'admin' | 'teacher'; familyId?: string; name: string }> = {
  'sarah@example.com':   { password: 'demo1234', role: 'parent',  familyId: 'f1', name: 'Sarah Johnson' },
  'claire@example.com':  { password: 'demo1234', role: 'parent',  familyId: 'f2', name: 'Claire Brown' },
  'james@example.com':   { password: 'demo1234', role: 'parent',  familyId: 'f3', name: 'James Taylor' },
  'michael@example.com': { password: 'demo1234', role: 'parent',  familyId: 'f4', name: 'Michael Chen' },
  'admin@fairybread.au': { password: 'admin1234', role: 'admin',  name: 'Therese' },
  'jessica@fairybread.au': { password: 'tutor1234', role: 'teacher', name: 'Jessica Taylor' },
  'sarah.w@fairybread.au': { password: 'tutor1234', role: 'teacher', name: 'Sarah Wilson' },
};

const ROLE_DESTINATIONS: Record<string, string> = {
  parent: '/parent',
  admin: '/admin',
  teacher: '/teacher',
};

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
  const { setRole, setFamilyId } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Simulate network latency
    await new Promise(r => setTimeout(r, 700));

    const match = MOCK_CREDENTIALS[email.toLowerCase().trim()];

    if (!match || match.password !== password) {
      setError('Incorrect email or password. Please try again.');
      setLoading(false);
      return;
    }

    // TODO: replace with Supabase signInWithPassword + profile role lookup
    // const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    // const { data: profile } = await supabase.from('profiles').select('role, family_id').eq('id', data.user.id).single();

    setRole(match.role);
    if (match.familyId) setFamilyId(match.familyId);
    navigate(ROLE_DESTINATIONS[match.role]);
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
          <div className="auth-demo-hint">
            <strong>Demo credentials</strong>
            <div className="auth-demo-rows">
              <div><span>Parent</span><code>sarah@example.com</code><code>demo1234</code></div>
              <div><span>Admin</span><code>admin@fairybread.au</code><code>admin1234</code></div>
              <div><span>Tutor</span><code>jessica@fairybread.au</code><code>tutor1234</code></div>
            </div>
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

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? <span className="auth-spinner" /> : <><span>Sign in</span><ArrowRight size={16} /></>}
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
