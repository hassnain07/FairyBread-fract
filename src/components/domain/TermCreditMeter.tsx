import { Progress } from '../ui/Progress';
import type { Term } from '../../types/term';
import { termWeeksRemaining, isTermExpiringSoon } from '../../lib/utils/termUtils';

export function TermCreditMeter({ term }: { term: Term }) {
  const totalWeeks = 10;
  const weeksLeft = Math.min(termWeeksRemaining(term), totalWeeks);
  const weeksDone = Math.max(0, totalWeeks - weeksLeft);
  const pct = (weeksDone / totalWeeks) * 100;
  const expiringSoon = isTermExpiringSoon(term);

  return (
    <div className="term-credit-meter">
      <div className="term-credit-row">
        <div className="term-credit-labels">
          <span className="term-credit-main">
            <strong>{weeksDone}</strong> of {totalWeeks} weeks done
            {term.term_label && <span className="term-label-badge"> · {term.term_label}</span>}
          </span>
          <span className="term-credit-used">{weeksLeft} week{weeksLeft !== 1 ? 's' : ''} remaining</span>
        </div>
      </div>
      <Progress value={pct} color="teal" />
      <div className="credit-dots">
        {Array.from({ length: totalWeeks }, (_, i) => (
          <i key={i} className={i < weeksDone ? 'used' : 'free'} title={`Week ${i + 1}`} />
        ))}
      </div>
      {expiringSoon && (
        <div className="unlock-banner" style={{ marginTop: 10 }}>
          <span>⚠ Your term ends in {weeksLeft} week{weeksLeft !== 1 ? 's' : ''}. Renew soon to keep your classes.</span>
        </div>
      )}
    </div>
  );
}
