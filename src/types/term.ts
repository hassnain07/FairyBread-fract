import type { Payment } from './payment';

export type TermStatus = 'active' | 'expired' | 'pending_payment';

// Gating states — implement as explicit state machine per spec Section 2.1
export type TermGatingState = 'NO_TERM_EVER' | 'ACTIVE_TERM' | 'TERM_EXPIRED';

export type Term = {
  id: string;
  family_id: string;
  status: TermStatus;
  start_date: string;
  end_date: string; // start_date + 10 weeks
  // TODO: confirm with client — currently assumed constant 10, stored not hardcoded in UI logic
  classes_included: number;
  classes_booked: number;
  classes_remaining: number; // derived but stored for query simplicity
  payment?: Payment;
};
