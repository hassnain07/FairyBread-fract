export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'rejected';
export type PaymentType = 'term' | 'individual_class';

export type Payment = {
  id: string;
  family_id: string;
  family_name?: string;
  type: PaymentType;
  amount: number;
  gst: number;
  status: PaymentStatus;
  reference: string;
  receipt_filename?: string;
  // For individual class payments
  class_subject?: string;
  class_day?: string;
  class_time?: string;
  class_tutor?: string;
  child_name?: string;
  // Term label e.g. "Term 3, 2025"
  term_label?: string;
  created_at: string;
};
