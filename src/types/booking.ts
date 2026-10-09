import type { ClassSession } from './teacher';
import type { Child } from './family';

export type BookingSource = 'term_credit' | 'individual_purchase';
export type BookingStatus = 'confirmed' | 'waiting_list' | 'pending_payment' | 'cancelled';

export type ClassBooking = {
  id: string;
  family_id: string;
  child_id: string;
  class_session_id: string;
  source: BookingSource;
  status: BookingStatus;
  credit_consumed: boolean;
  credit_restored?: boolean;
  hold_expires_at?: string;
  session?: ClassSession;
  child?: Pick<Child, 'id' | 'name' | 'initials'>;
};

export type BookingCancelResult = {
  credit_restored: boolean;
  within_window: boolean;
};

export type Assessment = {
  id: string;
  family_id: string;
  child_id: string;
  teacher_id?: string;
  class_id?: string;
  scheduled_date?: string;
  scheduled_time?: string;
  status: 'awaiting_payment' | 'scheduled' | 'completed' | 'cancelled';
  payment_id?: string;
  notes?: string;
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

export type NewReport = Omit<StudentReport, 'id' | 'created_at'>;

export type AttendanceRecord = {
  class_session_id: string;
  child_id: string;
  status: 'present' | 'absent' | 'no_show' | 'late';
};

// Legacy — kept so unmigrated pages still compile
export type IndividualClassPurchase = {
  id: string;
  family_id: string;
  class_booking_id: string;
  payment_id?: string;
};
