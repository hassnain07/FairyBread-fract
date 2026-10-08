import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, RotateCcw } from 'lucide-react';

interface OtpInputProps {
  heading: string;
  subheading: ReactNode;
  stepLabel?: string;
  onVerified: () => void;
  onBack: () => void;
  onResend: () => Promise<void>;
}

const MOCK_OTP = '123456';
const RESEND_SECONDS = 30;

export function OtpInput({ heading, subheading, stepLabel, onVerified, onBack, onResend }: OtpInputProps) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  function handleChange(i: number, val: string) {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = digit;
    setDigits(next);
    setError('');
    if (digit && i < 5) inputRefs.current[i + 1]?.focus();
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const next = [...digits];
    for (let i = 0; i < 6; i++) next[i] = pasted[i] ?? '';
    setDigits(next);
    setError('');
    const focusIdx = Math.min(pasted.length, 5);
    inputRefs.current[focusIdx]?.focus();
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const code = digits.join('');
    if (code.length < 6) { setError('Please enter all 6 digits.'); return; }
    setLoading(true);
    await new Promise(r => setTimeout(r, 600));
    // TODO: replace with supabase.auth.verifyOtp({ email, token: code, type: 'email' })
    if (code !== MOCK_OTP) {
      setError('Incorrect code. Please try again.');
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
      setLoading(false);
      return;
    }
    setLoading(false);
    onVerified();
  }

  async function handleResend() {
    setResending(true);
    await onResend();
    setCountdown(RESEND_SECONDS);
    setDigits(['', '', '', '', '', '']);
    setError('');
    setResending(false);
    inputRefs.current[0]?.focus();
  }

  const hasError = !!error;

  return (
    <>
      <div className="auth-form-head">
        {stepLabel && <span className="auth-step-label">{stepLabel}</span>}
        <h2><span className="otp-heading-icon">✉️</span> {heading}</h2>
        <p>{subheading}</p>
      </div>

      <div className="otp-demo-hint">
        <strong>Demo:</strong> the code is always <code>123456</code>
      </div>

      <form className="auth-form" onSubmit={handleVerify} noValidate>
        <div className="otp-boxes" onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={el => { inputRefs.current[i] = el; }}
              className={`otp-box${d ? ' otp-box-filled' : ''}${hasError ? ' otp-box-error' : ''}`}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              autoComplete="one-time-code"
            />
          ))}
        </div>

        {error && (
          <div className="auth-error" style={{ marginTop: 8 }}>
            <span>{error}</span>
          </div>
        )}

        <div className="otp-resend">
          {countdown > 0 ? (
            <span>Resend code in {countdown}s</span>
          ) : (
            <button type="button" className="otp-resend-btn" onClick={handleResend} disabled={resending}>
              <RotateCcw size={13} /> {resending ? 'Sending…' : 'Resend code'}
            </button>
          )}
        </div>

        <div className="auth-form-actions">
          <button type="button" className="auth-back-btn" onClick={onBack}>← Back</button>
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? <span className="auth-spinner" /> : <><span>Verify</span><ArrowRight size={16} /></>}
          </button>
        </div>
      </form>
    </>
  );
}
