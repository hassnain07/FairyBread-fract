export type BookingSource = 'term_credit' | 'individual_purchase';
export type BookingStatus = 'confirmed' | 'cancelled';

export type ClassBooking = {
  id: string;
  family_id: string;
  child_id: string;
  class_instance_id: string;
  source: BookingSource;
  status: BookingStatus;
  credit_consumed: boolean;
};

export type Assessment = {
  id: string;
  family_id?: string;
  child_id: string;
  teacher_id?: string;
  class_instance_id?: string;
  date?: string;
  time?: string;
  outcome?: 'pending' | 'complete';
  payment_id?: string;
};

export type IndividualClassPurchase = {
  id: string;
  family_id: string;
  class_booking_id: string;
  payment_id?: string;
  // only creatable if family has >= 1 Term record (any status)
};

export type SubjectRating = { subject: string; rating: 1 | 2 | 3 | 4 | 5 };

export type StudentReport = {
  id: string;
  child_id: string;
  teacher_id: string;
  term: string;
  overall: 1 | 2 | 3 | 4 | 5;
  subjects: SubjectRating[];
  strengths: string;
  areas: string;
  note: string;
  created_at: string;
};
