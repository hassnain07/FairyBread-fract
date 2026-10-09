import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, RotateCcw } from 'lucide-react';
import { toAppError } from '../../../lib/data/errors';

interface OtpInputProps {
  heading: string;
  subheading: ReactNode;
  stepLabel?: string;
  /** Called with the 6-digit code; throw AppError on a bad code */
  onVerify: (code: string) => Promise<void>;
  onVerified: () => void;
  onBack: () => void;
  onResend: () => Promise<void>;
}

const RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

export function OtpInput({
  heading,
  subheading,
  stepLabel,
  onVerify,
  onVerified,
  onBack,
  onResend,
}: OtpInputProps) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(RESEND_SECONDS);
  const [lockoutCountdown, setLockoutCountdown] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [resending, setResending] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { inputRefs.current[0]?.focus(); }, []);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const t = setTimeout(() => setResendCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCountdown]);

  useEffect(() => {
    if (lockoutCountdown <= 0) return;
    const t = setTimeout(() => setLockoutCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [lockoutCountdown]);

  function handleChange(i: number, val: string) {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = digit;
    setDigits(next);
    setError('');
    if (digit && i < 5) inputRefs.current[i + 1]?.focus();
    // Auto-submit when all 6 digits are filled
    if (digit && i === 5 && next.every(d => d)) {
      void submitCode(next.join(''));
    }
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
    if (pasted.length === 6) void submitCode(pasted);
  }

  async function submitCode(code: string) {
    if (lockoutCountdown > 0) return;
    if (code.length < 6) { setError('Please enter all 6 digits.'); return; }
    setLoading(true);
    setError('');
    try {
      await onVerify(code);
      onVerified();
    } catch (err) {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setError(toAppError(err).message);
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
      if (newAttempts >= MAX_ATTEMPTS) {
        setLockoutCountdown(LOCKOUT_SECONDS);
        setError(`Too many incorrect attempts. Please wait ${LOCKOUT_SECONDS} seconds before trying again.`);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    await submitCode(digits.join(''));
  }

  async function handleResend() {
    setResending(true);
    try {
      await onResend();
      setResendCountdown(RESEND_SECONDS);
      setDigits(['', '', '', '', '', '']);
      setError('');
      setAttempts(0);
      inputRefs.current[0]?.focus();
    } finally {
      setResending(false);
    }
  }

  const isLocked = lockoutCountdown > 0;
  const hasError = !!error;

  return (
    <>
      <div className="auth-form-head">
        {stepLabel && <span className="auth-step-label">{stepLabel}</span>}
        <h2><span className="otp-heading-icon">✉️</span> {heading}</h2>
        <p>{subheading}</p>
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
              disabled={loading || isLocked}
            />
          ))}
        </div>

        {error && (
          <div className="auth-error" style={{ marginTop: 8 }}>
            <span>{error}</span>
          </div>
        )}

        <div className="otp-resend">
          {isLocked ? (
            <span>Try again in {lockoutCountdown}s</span>
          ) : resendCountdown > 0 ? (
            <span>Resend code in {resendCountdown}s</span>
          ) : (
            <button type="button" className="otp-resend-btn" onClick={handleResend} disabled={resending}>
              <RotateCcw size={13} /> {resending ? 'Sending…' : 'Resend code'}
            </button>
          )}
        </div>

        <div className="auth-form-actions">
          <button type="button" className="auth-back-btn" onClick={onBack}>← Back</button>
          <button type="submit" className="auth-submit" disabled={loading || isLocked}>
            {loading ? <span className="auth-spinner" /> : <><span>Verify</span><ArrowRight size={16} /></>}
          </button>
        </div>
      </form>
    </>
  );
}
