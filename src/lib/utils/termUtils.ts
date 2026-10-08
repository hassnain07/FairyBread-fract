import type { Term, TermGatingState } from '../../types/term';
import { TERM_EXPIRY_WARNING_WEEKS } from '../config';

/**
 * Derives the gating state for a family from their term history.
 * This is the canonical implementation — hooks and components must call this,
 * not re-implement the logic inline.
 *
 * Rules (spec Section 2.1):
 * - NO_TERM_EVER  : no Term records at all
 * - ACTIVE_TERM   : at least one term whose end_date is in the future (calendar clock, not credit clock)
 * - TERM_EXPIRED  : has term history but no term is currently within its 10-week window
 *
 * The stored `status` field is NOT trusted for gating — the calendar date is authoritative.
 * This prevents stale DB state from incorrectly unlocking or blocking booking.
 */
export function computeGatingState(terms: Term[], now: Date = new Date()): TermGatingState {
  if (terms.length === 0) return 'NO_TERM_EVER';
  const hasActiveTerm = terms.some(t => new Date(t.end_date) > now);
  return hasActiveTerm ? 'ACTIVE_TERM' : 'TERM_EXPIRED';
}

/**
 * Returns the currently active term (end_date in the future), or null.
 * Picks the one with the latest start_date if somehow multiple overlap.
 */
export function getActiveTerm(terms: Term[], now: Date = new Date()): Term | null {
  const active = terms
    .filter(t => new Date(t.end_date) > now)
    .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
  return active[0] ?? null;
}

/**
 * Returns whole calendar weeks remaining until the term's end_date.
 * Returns 0 if the term has already ended.
 */
export function termWeeksRemaining(term: Term, now: Date = new Date()): number {
  const msRemaining = new Date(term.end_date).getTime() - now.getTime();
  if (msRemaining <= 0) return 0;
  return Math.ceil(msRemaining / (7 * 24 * 60 * 60 * 1000));
}

/**
 * Returns true if the term is within the expiry warning window
 * (≤ TERM_EXPIRY_WARNING_WEEKS weeks remaining, but not yet expired).
 */
export function isTermExpiringSoon(term: Term, now: Date = new Date()): boolean {
  const weeks = termWeeksRemaining(term, now);
  return weeks > 0 && weeks <= TERM_EXPIRY_WARNING_WEEKS;
}
