export type TermStatus = 'active' | 'expired' | 'pending_payment' | 'scheduled';
export type TermGatingState = 'NO_TERM_EVER' | 'ACTIVE_TERM' | 'TERM_EXPIRED';

export type Term = {
  id: string;
  family_id: string;
  status: TermStatus;
  term_label?: string;
  start_date: string;
  end_date: string; // exclusive
  classes_included: number;
  classes_booked: number;
  classes_remaining: number;
};

export type GatingSnapshot = {
  state: TermGatingState;
  active_term_id?: string;
  classes_remaining: number;
  end_date?: string;
};
