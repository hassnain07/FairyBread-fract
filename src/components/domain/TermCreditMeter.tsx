import { Progress } from '../ui/Progress';
import type { Term } from '../../types/term';
import { termWeeksRemaining, isTermExpiringSoon } from '../../lib/utils/termUtils';

export function TermCreditMeter({ term }: { term: Term }) {
  const weeks = termWeeksRemaining(term);
  const expiringSoon = isTermExpiringSoon(term);
  const used = term.classes_included - term.classes_remaining;
  const pct = (term.classes_remaining / term.classes_included) * 100;
  return (
    <div className="term-credit-meter">
      <div className="term-credit-row">
        <div className="term-credit-labels">
          <span className="term-credit-main">
            <strong>{term.classes_remaining}</strong> of {term.classes_included} credits remaining
          </span>
          <span className="term-credit-used">{used} used</span>
        </div>
        <span className="muted">resets in {weeks} week{weeks !== 1 ? 's' : ''}</span>
      </div>
      <Progress value={pct} color="teal" />
      <div className="credit-dots">
        {Array.from({ length: term.classes_included }, (_, i) => (
          <i key={i} className={i < used ? 'used' : 'free'} title={i < used ? `Credit ${i + 1} used` : `Credit ${i + 1} available`} />
        ))}
      </div>
      {expiringSoon && (
        <div className="unlock-banner" style={{ marginTop: 10 }}>
          <span>⚠ Your term ends in {weeks} week{weeks !== 1 ? 's' : ''}. Book remaining classes or renew soon.</span>
        </div>
      )}
    </div>
  );
}
