import type { Family, Child } from '../../../types/family';
import type { Term } from '../../../types/term';
import type { Payment } from '../../../types/payment';
import { TERM_BASE_PRICE, REGISTRATION_FEE, GST_RATE, TERM_CREDITS } from '../../config';

const TERM_AMOUNT = TERM_BASE_PRICE + REGISTRATION_FEE;
const TERM_GST = TERM_AMOUNT * GST_RATE;

export const mockChildren: Child[] = [
  { id: 'c1', family_id: 'f1', name: 'Emma Johnson', initials: 'EJ', givenName: 'Emma', familyName: 'Johnson', year: 'Year 5', school: 'Riverside Primary', enrolled: true,
    subjects: ['Mathematics', 'English'], preferredDays: ['Monday', 'Wednesday'], goals: 'Build confidence with fractions and improve essay writing.',
    notes: 'Emma loves creative challenges and works best in small groups. She enjoys drawing and reading fantasy novels.',
    preferredTutor: 'Jessica Taylor', sessions: '2 sessions per week' },
  { id: 'c2', family_id: 'f1', name: 'Oliver Johnson', initials: 'OJ', givenName: 'Oliver', familyName: 'Johnson', year: 'Year 3', school: 'Riverside Primary', enrolled: true,
    subjects: ['Reading & Spelling'], preferredDays: ['Tuesday', 'Thursday'], goals: 'Improve reading fluency and spelling.',
    notes: 'Oliver is very energetic and responds well to games and rewards. Loves dinosaurs and sport.',
    preferredTutor: 'No preference', sessions: '1 session per week' },
  { id: 'c3', family_id: 'f2', name: 'Sophie Brown', initials: 'SB', givenName: 'Sophie', familyName: 'Brown', year: 'Year 6', school: "St Mary's College", enrolled: true,
    subjects: ['Mathematics', 'English'], preferredDays: ['Wednesday', 'Friday'], goals: 'Prepare for high school transition, strengthen algebra skills.',
    notes: 'Sophie is self-motivated and detail-oriented. She enjoys science and coding in her spare time.',
    preferredTutor: 'Sarah Wilson', sessions: '2 sessions per week' },
  { id: 'c4', family_id: 'f3', name: 'Liam Taylor', initials: 'LT', givenName: 'Liam', familyName: 'Taylor', year: 'Year 4', school: 'Northside Primary', enrolled: false },
  { id: 'c5', family_id: 'f3', name: 'Mia Taylor', initials: 'MT', givenName: 'Mia', familyName: 'Taylor', year: 'Year 2', school: 'Northside Primary', enrolled: false },
  { id: 'c6', family_id: 'f4', name: 'Noah Chen', initials: 'NC', givenName: 'Noah', familyName: 'Chen', year: 'Year 1', school: 'Greenfield Primary', enrolled: false },
];

export const mockFamilies: Family[] = [
  { id: 'f1', reference_code: 'FAM-001', parent_name: 'Sarah Johnson', email: 'sarah@example.com', children: mockChildren.filter(c => c.family_id === 'f1') },
  { id: 'f2', reference_code: 'FAM-002', parent_name: 'Claire Brown', email: 'claire@example.com', children: mockChildren.filter(c => c.family_id === 'f2') },
  { id: 'f3', reference_code: 'FAM-003', parent_name: 'James Taylor', email: 'james@example.com', children: mockChildren.filter(c => c.family_id === 'f3') },
  { id: 'f4', reference_code: 'FAM-004', parent_name: 'Michael Chen', email: 'michael@example.com', children: mockChildren.filter(c => c.family_id === 'f4') },
];

const TERM_AMOUNT_CENTS = Math.round(TERM_AMOUNT * 100);
const TERM_GST_CENTS = Math.round(TERM_GST * 100);

export const mockPayments: Payment[] = [
  { id: 'pay1', family_id: 'f1', family_name: 'Sarah Johnson', type: 'term', amount_cents: TERM_AMOUNT_CENTS, gst_cents: TERM_GST_CENTS, total_cents: TERM_AMOUNT_CENTS + TERM_GST_CENTS, status: 'paid', reference: 'TERM-F1', term_label: 'Term 3, 2025', details: {}, created_at: '2025-07-14T00:00:00Z' },
  { id: 'pay2', family_id: 'f2', family_name: 'Claire Brown', type: 'term', amount_cents: TERM_AMOUNT_CENTS, gst_cents: TERM_GST_CENTS, total_cents: TERM_AMOUNT_CENTS + TERM_GST_CENTS, status: 'paid', reference: 'TERM-F2', term_label: 'Term 3, 2025', details: {}, created_at: '2025-07-14T00:00:00Z' },
  { id: 'pay3', family_id: 'f3', family_name: 'James Taylor', type: 'term', amount_cents: TERM_AMOUNT_CENTS, gst_cents: TERM_GST_CENTS, total_cents: TERM_AMOUNT_CENTS + TERM_GST_CENTS, status: 'paid', reference: 'TERM-F3', term_label: 'Term 2, 2025', details: {}, created_at: '2025-01-06T00:00:00Z' },
  { id: 'pay4', family_id: 'f4', family_name: 'Michael Chen', type: 'term', amount_cents: TERM_AMOUNT_CENTS, gst_cents: TERM_GST_CENTS, total_cents: TERM_AMOUNT_CENTS + TERM_GST_CENTS, status: 'pending', reference: 'TERM-F4', term_label: 'Term 3, 2025', proof_filename: 'bank-transfer-receipt.jpg', details: {}, created_at: new Date().toISOString() },
  { id: 'pay5', family_id: 'f3', family_name: 'James Taylor', type: 'individual_class', amount_cents: 5000, gst_cents: 500, total_cents: 5500, status: 'pending', reference: 'CLASS-LIAM-MATH', proof_filename: 'payment-proof.png', details: { child_name: 'Liam Taylor', subject: 'Mathematics', day: 'Monday', time: '3:30 PM', tutor: 'Jessica Taylor' }, created_at: new Date().toISOString() },
];

const now = new Date();
const activeStart = new Date(now); activeStart.setDate(now.getDate() - 14);
const activeEnd = new Date(now); activeEnd.setDate(now.getDate() + 56);
const expiredStart = new Date(now); expiredStart.setDate(now.getDate() - 84);
const expiredEnd = new Date(now); expiredEnd.setDate(now.getDate() - 14);
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export const mockTerms: Term[] = [
  { id: 't1', family_id: 'f1', status: 'active', start_date: fmt(activeStart), end_date: fmt(activeEnd), classes_included: TERM_CREDITS, classes_booked: 7, classes_remaining: 3 },
  { id: 't2', family_id: 'f2', status: 'active', start_date: fmt(activeStart), end_date: fmt(activeEnd), classes_included: TERM_CREDITS, classes_booked: 10, classes_remaining: 0 },
  { id: 't3', family_id: 'f3', status: 'expired', start_date: fmt(expiredStart), end_date: fmt(expiredEnd), classes_included: TERM_CREDITS, classes_booked: 8, classes_remaining: 2 },
];
