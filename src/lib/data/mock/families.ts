import type { Family, Child } from '../../../types/family';
import type { Term } from '../../../types/term';
import type { Payment } from '../../../types/payment';
import { TERM_BASE_PRICE, REGISTRATION_FEE, GST_RATE, TERM_CREDITS } from '../../config';

const TERM_AMOUNT = TERM_BASE_PRICE + REGISTRATION_FEE;
const TERM_GST = TERM_AMOUNT * GST_RATE;

export const mockChildren: Child[] = [
  // f1 — ACTIVE_TERM with credits remaining
  { id: 'c1', family_id: 'f1', name: 'Emma Johnson', initials: 'EJ', year: 'Year 5', school: 'Riverside Primary', enrolled: true,
    subjects: ['Mathematics', 'English'], preferredDays: ['Monday', 'Wednesday'], goals: 'Build confidence with fractions and improve essay writing.',
    notes: 'Emma loves creative challenges and works best in small groups. She enjoys drawing and reading fantasy novels.',
    preferredTutor: 'Jessica Taylor', sessions: '2 sessions per week' },
  { id: 'c2', family_id: 'f1', name: 'Oliver Johnson', initials: 'OJ', year: 'Year 3', school: 'Riverside Primary', enrolled: true,
    subjects: ['Reading & Spelling'], preferredDays: ['Tuesday', 'Thursday'], goals: 'Improve reading fluency and spelling.',
    notes: 'Oliver is very energetic and responds well to games and rewards. Loves dinosaurs and sport.',
    preferredTutor: 'No preference', sessions: '1 session per week' },
  { id: 'c3', family_id: 'f2', name: 'Sophie Brown', initials: 'SB', year: 'Year 6', school: "St Mary's College", enrolled: true,
    subjects: ['Mathematics', 'English'], preferredDays: ['Wednesday', 'Friday'], goals: 'Prepare for high school transition, strengthen algebra skills.',
    notes: 'Sophie is self-motivated and detail-oriented. She enjoys science and coding in her spare time.',
    preferredTutor: 'Sarah Wilson', sessions: '2 sessions per week' },
  // f3 — TERM_EXPIRED
  { id: 'c4', family_id: 'f3', name: 'Liam Taylor', initials: 'LT', year: 'Year 4', school: 'Northside Primary', enrolled: false },
  { id: 'c5', family_id: 'f3', name: 'Mia Taylor', initials: 'MT', year: 'Year 2', school: 'Northside Primary', enrolled: false },
  // f4 — NO_TERM_EVER
  { id: 'c6', family_id: 'f4', name: 'Noah Chen', initials: 'NC', year: 'Year 1', school: 'Greenfield Primary', enrolled: false },
];

export const mockFamilies: Family[] = [
  // f1 — ACTIVE_TERM, credits remaining (happy path)
  { id: 'f1', parent_id: 'p1', children: mockChildren.filter(c => c.family_id === 'f1') },
  // f2 — ACTIVE_TERM, 0 credits remaining (term still open by calendar, but credits exhausted)
  { id: 'f2', parent_id: 'p2', children: mockChildren.filter(c => c.family_id === 'f2') },
  // f3 — TERM_EXPIRED (10-week window elapsed, has term history)
  { id: 'f3', parent_id: 'p3', children: mockChildren.filter(c => c.family_id === 'f3') },
  // f4 — NO_TERM_EVER (brand new family, zero purchase history)
  { id: 'f4', parent_id: 'p4', children: mockChildren.filter(c => c.family_id === 'f4') },
];

export const mockPayments: Payment[] = [
  { id: 'pay1', family_id: 'f1', family_name: 'Sarah Johnson', type: 'term', amount: TERM_AMOUNT, gst: TERM_GST, status: 'paid', reference: 'TERM-F1', term_label: 'Term 3, 2025', created_at: '2025-07-14T00:00:00Z' },
  { id: 'pay2', family_id: 'f2', family_name: 'Claire Brown', type: 'term', amount: TERM_AMOUNT, gst: TERM_GST, status: 'paid', reference: 'TERM-F2', term_label: 'Term 3, 2025', created_at: '2025-07-14T00:00:00Z' },
  { id: 'pay3', family_id: 'f3', family_name: 'James Taylor', type: 'term', amount: TERM_AMOUNT, gst: TERM_GST, status: 'paid', reference: 'TERM-F3', term_label: 'Term 2, 2025', created_at: '2025-01-06T00:00:00Z' },
  // Pre-seeded pending payments so admin page shows real data immediately
  { id: 'pay4', family_id: 'f4', family_name: 'Michael Chen', type: 'term', amount: TERM_AMOUNT, gst: TERM_GST, status: 'pending', reference: 'TERM-F4', term_label: 'Term 3, 2025', receipt_filename: 'bank-transfer-receipt.jpg', created_at: new Date().toISOString() },
  { id: 'pay5', family_id: 'f3', family_name: 'James Taylor', type: 'individual_class', amount: 50, gst: 5, status: 'pending', reference: 'CLASS-LIAM-MATH', child_name: 'Liam Taylor', class_subject: 'Mathematics', class_day: 'Monday', class_time: '3:30 PM', class_tutor: 'Jessica Taylor', receipt_filename: 'payment-proof.png', created_at: new Date().toISOString() },
];

// Active terms run 10 weeks from start. End dates are set ~6 months ahead of now so
// getActiveTerm() (calendar-based) always returns a live term in the demo.
const now = new Date();
const activeStart = new Date(now); activeStart.setDate(now.getDate() - 14);
const activeEnd = new Date(now); activeEnd.setDate(now.getDate() + 56); // ~8 weeks remaining
const expiredStart = new Date(now); expiredStart.setDate(now.getDate() - 84);
const expiredEnd = new Date(now); expiredEnd.setDate(now.getDate() - 14);

const fmt = (d: Date) => d.toISOString().slice(0, 10);

export const mockTerms: Term[] = [
  // f1 — ACTIVE_TERM: 3 credits remaining
  {
    id: 't1', family_id: 'f1', status: 'active',
    start_date: fmt(activeStart), end_date: fmt(activeEnd),
    classes_included: TERM_CREDITS, classes_booked: 7, classes_remaining: 3,
    payment: mockPayments[0],
  },
  // f2 — ACTIVE_TERM: ALL 10 credits used up
  {
    id: 't2', family_id: 'f2', status: 'active',
    start_date: fmt(activeStart), end_date: fmt(activeEnd),
    classes_included: TERM_CREDITS, classes_booked: 10, classes_remaining: 0,
    payment: mockPayments[1],
  },
  // f3 — TERM_EXPIRED: ended ~2 weeks ago, 2 unused credits (no rollover)
  {
    id: 't3', family_id: 'f3', status: 'expired',
    start_date: fmt(expiredStart), end_date: fmt(expiredEnd),
    classes_included: TERM_CREDITS, classes_booked: 8, classes_remaining: 2,
    payment: mockPayments[2],
  },
  // f4 — NO_TERM_EVER: no terms at all
];
