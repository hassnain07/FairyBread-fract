import type { DataClient } from '../types';
import { mockFamilies, mockChildren, mockTerms, mockPayments } from './families';
import { mockConversations, mockMessages, mockNotifications } from './messages';
import type { Child, NewChild, ChildPatch, EnrolmentInput } from '../../../types/family';
import type { Term, GatingSnapshot } from '../../../types/term';
import type { ClassBooking, Assessment, IndividualClassPurchase, StudentReport, NewReport, BookingCancelResult } from '../../../types/booking';
import type { Payment, PaymentIntent } from '../../../types/payment';
import type { Teacher, ClassInstance, ClassSlot, ClassSession, Program } from '../../../types/teacher';
import type { ChatMessage } from '../../../types/message';
import type { ShopProduct, ShopOrder, ShopCartItem } from '../../../types/shop';
import { INDIVIDUAL_CLASS_PRICE } from '../../config';

let _children = [...mockChildren];
let _terms = [...mockTerms];
let _bookings: ClassBooking[] = [
  { id: 'b1', family_id: 'f1', child_id: 'c1', class_session_id: 'cs1', source: 'term_credit', status: 'confirmed', credit_consumed: true },
  { id: 'b2', family_id: 'f1', child_id: 'c2', class_session_id: 'cs2', source: 'term_credit', status: 'confirmed', credit_consumed: true },
  { id: 'b3', family_id: 'f2', child_id: 'c3', class_session_id: 'cs1', source: 'term_credit', status: 'confirmed', credit_consumed: true },
];
let _assessments: Assessment[] = [
  { id: 'a1', family_id: 'f4', child_id: 'c6', status: 'awaiting_payment' },
];
let _individualPurchases: IndividualClassPurchase[] = [];
let _reports: StudentReport[] = [];
let _payments = [...mockPayments];
let _conversations = [...mockConversations];
let _messages = [...mockMessages];
let _notifications = [...mockNotifications];
let _documents: Record<string, string> = {};

const _mockProducts: ShopProduct[] = [
  { id: 'p1', title: 'Fractions Fun Workbook', category: 'Workbooks', price: 18, status: 'In Stock', image_url: '', description: 'A hands-on workbook covering fractions from basics to mixed numbers.', details: 'Suitable for Years 3–6. 80 pages of structured exercises, visual models and self-check answers.' },
  { id: 'p2', title: 'English Grammar Essentials', category: 'Workbooks', price: 20, status: 'In Stock', image_url: '', description: 'Clear, concise grammar practice for confident writers.', details: 'Covers parts of speech, punctuation, sentence structure and editing. Years 4–7.' },
  { id: 'p3', title: 'Reading Comprehension Cards', category: 'Flash Cards', price: 14, status: 'Low Stock', image_url: '', description: 'Bite-sized reading passages with comprehension questions on every card.', details: '60 double-sided cards. Three difficulty levels. Great for quick daily practice.' },
  { id: 'p4', title: 'Times Tables Mastery Pack', category: 'Flash Cards', price: 12, status: 'In Stock', image_url: '', description: 'Fast-track times tables recall with colour-coded card sets.', details: '120 cards covering 2× to 12×. Includes a progress tracker sheet.' },
  { id: 'p5', title: 'Creative Writing Starter Kit', category: 'Activity Kits', price: 28, status: 'In Stock', image_url: '', description: 'Everything a young writer needs to spark their imagination.', details: 'Includes prompt cards, story-planning sheets, a mini journal and sticker rewards.' },
  { id: 'p6', title: 'Maths Problem Solving Pack', category: 'Activity Kits', price: 24, status: 'Out of Stock', image_url: '', description: 'Real-world maths challenges that build logical thinking.', details: 'Puzzle cards, strategy guides and worked examples. Years 4–8.' },
];

let _shopOrders: ShopOrder[] = [];

export const mockTeachers: Teacher[] = [
  { id: 'tch1', name: 'Jessica Taylor', initials: 'JT', subjects: ['Mathematics', 'English'], color: 'pink' },
  { id: 'tch2', name: 'Sarah Wilson', initials: 'SW', subjects: ['English', 'Reading'], color: 'teal' },
  { id: 'tch3', name: 'Daniel Smith', initials: 'DS', subjects: ['Reading'], color: 'orange' },
];

const _seedClassInstances: ClassInstance[] = [
  { id: 'ci1', teacher_id: 'tch1', subject: 'Mathematics', day_of_week: 'Monday', time: '3:30 PM', capacity: 15, enrolled: 12, price: INDIVIDUAL_CLASS_PRICE },
  { id: 'ci2', teacher_id: 'tch2', subject: 'English', day_of_week: 'Wednesday', time: '4:30 PM', capacity: 15, enrolled: 13, price: INDIVIDUAL_CLASS_PRICE },
  { id: 'ci3', teacher_id: 'tch3', subject: 'Reading', day_of_week: 'Thursday', time: '4:00 PM', capacity: 15, enrolled: 15, price: INDIVIDUAL_CLASS_PRICE },
  { id: 'ci4', teacher_id: 'tch1', subject: 'Mathematics', day_of_week: 'Friday', time: '3:00 PM', capacity: 12, enrolled: 8, price: INDIVIDUAL_CLASS_PRICE },
];
let _classInstances = [..._seedClassInstances];

export const mockDataClient: DataClient = {
  // ── Auth (overridden by Supabase in composite client) ──────────────────────
  async signIn() { throw new Error('signIn not available in mock'); },
  async requestSignupOtp() {},
  async requestPasswordResetOtp() {},
  async verifyOtp() {},
  async setPassword() {},
  async signOut() {},
  async getMyContext() { return null; },
  onAuthChange() { return () => {}; },

  // ── Settings ───────────────────────────────────────────────────────────────
  async getSettings() { return {}; },
  async getDocuments() { return { ..._documents }; },
  async uploadDocument(key, file) {
    if (_documents[key]) URL.revokeObjectURL(_documents[key]);
    const url = URL.createObjectURL(file);
    _documents = { ..._documents, [key]: url };
    return url;
  },

  // ── Families & children ────────────────────────────────────────────────────
  async getFamily(familyId) {
    const f = mockFamilies.find(f => f.id === familyId);
    if (!f) throw new Error(`Family ${familyId} not found`);
    return f;
  },
  async getAllFamilies() { return mockFamilies; },
  async createFamily(input) {
    const f = { id: `f${Date.now()}`, reference_code: `FAM-${Date.now()}`, parent_name: input.parentName, email: input.email, phone: input.phone };
    return f;
  },
  async getChildren(familyId) { return _children.filter(c => c.family_id === familyId); },
  async getAllChildren() { return _children; },
  async addChild(familyId, child: NewChild) {
    const name = `${child.givenName} ${child.familyName}`.trim();
    const initials = [child.givenName[0], child.familyName[0]].filter(Boolean).join('').toUpperCase();
    const newChild: Child = {
      id: `c${Date.now()}`, family_id: familyId, name, initials,
      givenName: child.givenName, familyName: child.familyName,
      year: child.year, school: child.school ?? '', enrolled: false,
    };
    _children = [..._children, newChild];
    return newChild;
  },
  async updateChild(childId, patch: ChildPatch) {
    let updated: Child | undefined;
    _children = _children.map(c => {
      if (c.id !== childId) return c;
      updated = { ...c, ...patch };
      if (patch.givenName || patch.familyName) {
        const gn = patch.givenName ?? c.givenName;
        const fn = patch.familyName ?? c.familyName;
        updated = { ...updated!, name: `${gn} ${fn}`.trim(), initials: [gn[0], fn[0]].filter(Boolean).join('').toUpperCase() };
      }
      return updated!;
    });
    if (!updated) throw new Error(`Child ${childId} not found`);
    return updated;
  },
  async completeEnrolment(childId, _input: EnrolmentInput) {
    let updated: Child | undefined;
    _children = _children.map(c => {
      if (c.id !== childId) return c;
      updated = { ...c, enrolled: true };
      return updated;
    });
    if (!updated) throw new Error(`Child ${childId} not found`);
    return updated;
  },
  async adminMarkEnrolled(childId, _note) {
    let updated: Child | undefined;
    _children = _children.map(c => {
      if (c.id !== childId) return c;
      updated = { ...c, enrolled: true };
      return updated;
    });
    if (!updated) throw new Error(`Child ${childId} not found`);
    return updated;
  },

  // ── Terms & gating ─────────────────────────────────────────────────────────
  async getTerms(familyId) { return _terms.filter(t => t.family_id === familyId); },
  async getAllTerms() { return _terms; },
  async getActiveTerm(familyId) {
    const now = new Date();
    return _terms.find(t => t.family_id === familyId && new Date(t.end_date) > now) ?? null;
  },
  async getGating(familyId): Promise<GatingSnapshot> {
    const now = new Date();
    const familyTerms = _terms.filter(t => t.family_id === familyId);
    const active = familyTerms.find(t => new Date(t.end_date) > now);
    const state = familyTerms.length === 0 ? 'NO_TERM_EVER' : active ? 'ACTIVE_TERM' : 'TERM_EXPIRED';
    return { state, active_term_id: active?.id, classes_remaining: active?.classes_remaining ?? 0, end_date: active?.end_date };
  },
  async adminAdjustCredits(termId, delta, _note) {
    let updated: Term | undefined;
    _terms = _terms.map(t => {
      if (t.id !== termId) return t;
      updated = { ...t, classes_included: t.classes_included + delta };
      return updated;
    });
    if (!updated) throw new Error(`Term ${termId} not found`);
    return updated;
  },

  // ── Catalog & sessions ─────────────────────────────────────────────────────
  async getTeachers() { return mockTeachers; },
  async getPrograms(): Promise<Program[]> { return []; },
  async getClassSlots(): Promise<ClassSlot[]> { return []; },
  async getUpcomingSessions(): Promise<ClassSession[]> { return []; },
  async getClassInstances() { return _classInstances; },
  async createClassInstance(cls) {
    const c: ClassInstance = { ...cls, id: `ci${Date.now()}`, enrolled: 0 };
    _classInstances = [..._classInstances, c];
    return c;
  },
  async updateClassInstance(id, patch) {
    let updated: ClassInstance | undefined;
    _classInstances = _classInstances.map(c => { if (c.id !== id) return c; updated = { ...c, ...patch }; return updated; });
    if (!updated) throw new Error(`ClassInstance ${id} not found`);
    return updated;
  },
  async deleteClassInstance(id) { _classInstances = _classInstances.filter(c => c.id !== id); },

  // ── Bookings ───────────────────────────────────────────────────────────────
  async getBookings(familyId) { return _bookings.filter(b => b.family_id === familyId); },
  async getAllBookings() { return _bookings; },
  async getBookingsForTeacher() { return _bookings; },
  async bookClassSession(childId, sessionId): Promise<ClassBooking> {
    const child = _children.find(c => c.id === childId);
    if (!child) throw new Error('child_not_found');
    const familyId = child.family_id;
    const term = _terms.find(t => t.family_id === familyId && t.status === 'active');
    if (!term) throw new Error('no_term_ever');
    if (term.classes_remaining <= 0) throw new Error('no_credits');
    const b: ClassBooking = { id: `b${Date.now()}`, family_id: familyId, child_id: childId, class_session_id: sessionId, source: 'term_credit', status: 'confirmed', credit_consumed: true };
    _bookings = [..._bookings, b];
    _terms = _terms.map(t => t.id === term.id ? { ...t, classes_booked: t.classes_booked + 1, classes_remaining: Math.max(0, t.classes_remaining - 1) } : t);
    return b;
  },
  async joinWaitlist(childId, sessionId): Promise<ClassBooking> {
    const child = _children.find(c => c.id === childId);
    if (!child) throw new Error('child_not_found');
    const b: ClassBooking = { id: `b${Date.now()}`, family_id: child.family_id, child_id: childId, class_session_id: sessionId, source: 'term_credit', status: 'waiting_list', credit_consumed: false };
    _bookings = [..._bookings, b];
    return b;
  },
  async cancelBooking(bookingId): Promise<BookingCancelResult> {
    const booking = _bookings.find(b => b.id === bookingId);
    _bookings = _bookings.map(b => b.id === bookingId ? { ...b, status: 'cancelled' } : b);
    if (booking?.source === 'term_credit' && booking.credit_consumed) {
      _terms = _terms.map(t =>
        t.family_id === booking.family_id && t.status === 'active'
          ? { ...t, classes_booked: Math.max(0, t.classes_booked - 1), classes_remaining: t.classes_remaining + 1 }
          : t
      );
      return { credit_restored: true, within_window: true };
    }
    return { credit_restored: false, within_window: false };
  },

  // ── Payments ───────────────────────────────────────────────────────────────
  async getPriceQuote(type) {
    const base = type === 'term' ? 50000 : 5000;
    const reg = type === 'term' ? 3000 : 0;
    const amount = base + reg;
    const gst = Math.round(amount * 0.1);
    return { base_cents: base, registration_cents: reg, amount_cents: amount, gst_cents: gst, total_cents: amount + gst };
  },
  async getPayments(familyId) { return _payments.filter(p => p.family_id === familyId); },
  async getAllPayments() { return _payments; },
  async submitPayment(intent: PaymentIntent, _proof: File) {
    const p: Payment = {
      id: `pay${Date.now()}`, family_id: intent.familyId, type: intent.type,
      amount_cents: intent.type === 'term' ? 53000 : 5000,
      gst_cents: intent.type === 'term' ? 5300 : 500,
      total_cents: intent.type === 'term' ? 58300 : 5500,
      status: 'pending', reference: `${intent.familyId}-${intent.type.toUpperCase()}`,
      details: {}, created_at: new Date().toISOString(),
    };
    _payments = [..._payments, p];
    return p;
  },
  async getProofUrl(_paymentId) { return '#'; },
  async getPendingPayments() { return _payments.filter(p => p.status === 'pending'); },
  async verifyPayment(paymentId, action, _note) {
    _payments = _payments.map(p => p.id === paymentId ? { ...p, status: action === 'approve' ? 'paid' : 'rejected' } : p);
    const payment = _payments.find(p => p.id === paymentId)!;
    if (action === 'approve' && payment?.type === 'term') {
      const now = new Date(); const end = new Date(now); end.setDate(now.getDate() + 70);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      const existing = _terms.find(t => t.family_id === payment.family_id && t.status === 'active');
      if (!existing) {
        _terms = [..._terms, { id: `t${Date.now()}`, family_id: payment.family_id, status: 'active', start_date: fmt(now), end_date: fmt(end), classes_included: 10, classes_booked: 0, classes_remaining: 10 }];
      }
    }
    return payment;
  },
  async adminRecordPayment(input) {
    const p: Payment = {
      id: `pay${Date.now()}`, family_id: input.familyId, type: input.type,
      amount_cents: input.type === 'term' ? 53000 : 5000,
      gst_cents: input.type === 'term' ? 5300 : 500,
      total_cents: input.type === 'term' ? 58300 : 5500,
      status: 'paid', reference: `${input.familyId}-ADMIN`,
      details: {}, created_at: new Date().toISOString(),
    };
    _payments = [..._payments, p];
    if (input.type === 'term') {
      const now = new Date(); const end = new Date(now); end.setDate(now.getDate() + 70);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      _terms = [..._terms, { id: `t${Date.now()}`, family_id: input.familyId, status: 'active', start_date: fmt(now), end_date: fmt(end), classes_included: 10, classes_booked: 0, classes_remaining: 10 }];
    }
    return p;
  },

  // ── Assessments ────────────────────────────────────────────────────────────
  async getAssessments(familyId) { return _assessments.filter(a => a.family_id === familyId); },

  // ── Reports ────────────────────────────────────────────────────────────────
  async getReports(teacherId) { return _reports.filter(r => r.teacher_id === teacherId); },
  async createReport(report: NewReport) {
    const r: StudentReport = { ...report, id: `rpt${Date.now()}`, created_at: new Date().toISOString() };
    _reports = [..._reports, r];
    return r;
  },
  async getTeacherAssessments(teacherId) { return _assessments.filter(a => a.teacher_id === teacherId); },
  async createTeacherAssessment(assessment) {
    const a: Assessment = { ...assessment, id: `a${Date.now()}` };
    _assessments = [..._assessments, a];
    return a;
  },

  // ── Messages ───────────────────────────────────────────────────────────────
  async getConversations(participantId) { return _conversations.filter(c => c.participant_ids.includes(participantId)); },
  async getMessages(conversationId) { return _messages.filter(m => m.conversation_id === conversationId); },
  async sendMessage(msg) {
    const m: ChatMessage = { ...msg, id: `m${Date.now()}`, created_at: new Date().toISOString() };
    _messages = [..._messages, m];
    _conversations = _conversations.map(c => c.id === msg.conversation_id ? { ...c, last_message: msg.body, last_message_at: m.created_at } : c);
    return m;
  },
  async markConversationRead(conversationId) {
    _conversations = _conversations.map(c => c.id === conversationId ? { ...c, unread_count: 0 } : c);
  },

  // ── Notifications ──────────────────────────────────────────────────────────
  async getNotifications(familyId, teacherId) {
    return _notifications.filter(n =>
      (!n.family_id && !n.teacher_id) ||
      (familyId && n.family_id === familyId) ||
      (teacherId && n.teacher_id === teacherId)
    );
  },
  async markNotificationRead(notificationId) {
    _notifications = _notifications.map(n => n.id === notificationId ? { ...n, read: true } : n);
  },
  async markAllNotificationsRead(familyId, teacherId) {
    _notifications = _notifications.map(n => {
      const mine = (!n.family_id && !n.teacher_id) || (familyId && n.family_id === familyId) || (teacherId && n.teacher_id === teacherId);
      return mine ? { ...n, read: true } : n;
    });
  },

  // ── Shop ───────────────────────────────────────────────────────────────────
  async getShopProducts() { return _mockProducts; },
  async getShopOrders(familyId) { return _shopOrders.filter(o => o.family_id === familyId); },
  async getAllShopOrders() { return _shopOrders; },
  async placeOrder(familyId, familyName, items, paymentMethod, delivery, source, receiptFilename) {
    const orderItems = items.map((c: ShopCartItem) => ({ product_id: c.product.id, title: c.product.title, price: c.product.price, quantity: c.quantity }));
    const total = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);
    const order: ShopOrder = {
      id: `ord${Date.now()}`, family_id: familyId, family_name: familyName, source, items: orderItems, total,
      status: 'Pending', payment_method: paymentMethod, payment_status: paymentMethod === 'cod' ? 'unpaid' : 'pending_verification',
      receipt_filename: receiptFilename, delivery_name: delivery.name, delivery_address: delivery.address,
      delivery_phone: delivery.phone, delivery_email: delivery.email, created_at: new Date().toISOString(),
    };
    _shopOrders = [..._shopOrders, order];
    return order;
  },
  async verifyShopOrder(orderId, action) {
    _shopOrders = _shopOrders.map(o => o.id === orderId ? { ...o, payment_status: action === 'approve' ? 'paid' : 'unpaid', status: action === 'approve' ? 'Processing' : 'Pending' } : o);
  },

  // ── Legacy ─────────────────────────────────────────────────────────────────
  async getIndividualPurchases(familyId) { return _individualPurchases.filter(p => p.family_id === familyId); },
  async createIndividualPurchase(purchase) {
    const p: IndividualClassPurchase = { ...purchase, id: `ip${Date.now()}` };
    _individualPurchases = [..._individualPurchases, p];
    return p;
  },
};
