export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'rejected';
export type PaymentType = 'term' | 'individual_class' | 'assessment';

export type Payment = {
  id: string;
  family_id: string;
  family_name?: string;
  type: PaymentType;
  // Cents fields (from DB)
  amount_cents: number;
  gst_cents: number;
  total_cents: number;
  status: PaymentStatus;
  reference: string;
  term_label?: string;
  proof_filename?: string;
  review_note?: string;
  // Details snapshot (subject, child, day, time, tutor for individual/assessment)
  details: {
    child_name?: string;
    subject?: string;
    day?: string;
    time?: string;
    tutor?: string;
  };
  created_at: string;
};

export type PaymentIntent =
  | { type: 'term'; familyId: string }
  | { type: 'individual_class'; familyId: string; childId: string; sessionId: string }
  | { type: 'assessment'; familyId: string; childId: string; date: string; time: string };

export type PriceQuote = {
  base_cents: number;
  registration_cents: number;
  amount_cents: number;
  gst_cents: number;
  total_cents: number;
};
