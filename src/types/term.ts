export type TermStatus = 'active' | 'expired' | 'pending_payment' | 'scheduled';
export type TermGatingState = 'NO_TERM_EVER' | 'ACTIVE_TERM' | 'TERM_EXPIRED';

export type Term = {
  id: string;
  family_id: string;
  status: TermStatus;
  term_label?: string;
  start_date: string;
  end_date: string; // exclusive (10 weeks)
};

export type SchoolTerm = {
  id: string;
  label: string;       // e.g. "Term 1 2025"
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
};

export type GatingSnapshot = {
  state: TermGatingState;
  active_term_id?: string;
  classes_remaining: number; // kept for compat, not used for gating
  end_date?: string;
};
