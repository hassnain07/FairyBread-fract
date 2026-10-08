import type { DataClient } from '../types';
import { mockFamilies, mockChildren, mockTerms, mockPayments } from './families';
import { mockConversations, mockMessages, mockNotifications } from './messages';
import type { Child } from '../../../types/family';
import type { ClassBooking, Assessment, IndividualClassPurchase, StudentReport } from '../../../types/booking';
import type { Teacher, ClassInstance } from '../../../types/teacher';
import type { ChatMessage } from '../../../types/message';
import type { ShopProduct, ShopOrder, ShopCartItem } from '../../../types/shop';
import { INDIVIDUAL_CLASS_PRICE } from '../../config';

let _children = [...mockChildren];
let _terms = [...mockTerms];
let _bookings: ClassBooking[] = [
  { id: 'b1', family_id: 'f1', child_id: 'c1', class_instance_id: 'ci1', source: 'term_credit', status: 'confirmed', credit_consumed: true },
  { id: 'b2', family_id: 'f1', child_id: 'c2', class_instance_id: 'ci2', source: 'term_credit', status: 'confirmed', credit_consumed: true },
  { id: 'b3', family_id: 'f2', child_id: 'c3', class_instance_id: 'ci1', source: 'term_credit', status: 'confirmed', credit_consumed: true },
];
let _assessments: Assessment[] = [
  { id: 'a1', family_id: 'f4', child_id: 'c6', payment_id: undefined },
];
let _individualPurchases: IndividualClassPurchase[] = [];
let _reports: StudentReport[] = [];
let _payments = [...mockPayments];
let _conversations = [...mockConversations];
let _messages = [...mockMessages];
let _notifications = [...mockNotifications];
let _documents: Record<string, string> = {}; // key → object URL (mock only)

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
  // TODO: confirm with client — price is internal/admin-facing only during term-credit booking.
  { id: 'ci1', teacher_id: 'tch1', subject: 'Mathematics', day_of_week: 'Monday', time: '3:30 PM', capacity: 15, enrolled: 12, price: INDIVIDUAL_CLASS_PRICE },
  { id: 'ci2', teacher_id: 'tch2', subject: 'English', day_of_week: 'Wednesday', time: '4:30 PM', capacity: 15, enrolled: 13, price: INDIVIDUAL_CLASS_PRICE },
  { id: 'ci3', teacher_id: 'tch3', subject: 'Reading', day_of_week: 'Thursday', time: '4:00 PM', capacity: 15, enrolled: 15, price: INDIVIDUAL_CLASS_PRICE },
  { id: 'ci4', teacher_id: 'tch1', subject: 'Mathematics', day_of_week: 'Friday', time: '3:00 PM', capacity: 12, enrolled: 8, price: INDIVIDUAL_CLASS_PRICE },
];
let _classInstances = [..._seedClassInstances];

export const mockDataClient: DataClient = {
  async getFamily(familyId) {
    const f = mockFamilies.find(f => f.id === familyId);
    if (!f) throw new Error(`Family ${familyId} not found`);
    return f;
  },
  async getAllFamilies() {
    return mockFamilies;
  },
  async getChildren(familyId) {
    return _children.filter(c => c.family_id === familyId);
  },
  async addChild(familyId, child) {
    const newChild: Child = { ...child, id: `c${Date.now()}`, family_id: familyId };
    _children = [..._children, newChild];
    return newChild;
  },
  async getTerms(familyId) {
    return _terms.filter(t => t.family_id === familyId);
  },
  async getActiveTerm(familyId) {
    const now = new Date();
    return _terms.find(t => t.family_id === familyId && new Date(t.end_date) > now) ?? null;
  },
  async getBookings(familyId) {
    return _bookings.filter(b => b.family_id === familyId);
  },
  async createBooking(booking) {
    const b: ClassBooking = { ...booking, id: `b${Date.now()}` };
    _bookings = [..._bookings, b];
    // Decrement credit if source is term_credit — 1 credit per booking, regardless of class/teacher
    if (booking.source === 'term_credit') {
      _terms = _terms.map(t =>
        t.family_id === booking.family_id && t.status === 'active'
          ? { ...t, classes_booked: t.classes_booked + 1, classes_remaining: Math.max(0, t.classes_remaining - 1) }
          : t
      );
    }
    return b;
  },
  async cancelBooking(bookingId) {
    const booking = _bookings.find(b => b.id === bookingId);
    _bookings = _bookings.map(b => b.id === bookingId ? { ...b, status: 'cancelled' } : b);
    // Restore credit on cancellation if it was a term_credit booking
    if (booking?.source === 'term_credit' && booking.credit_consumed) {
      _terms = _terms.map(t =>
        t.family_id === booking.family_id && t.status === 'active'
          ? { ...t, classes_booked: Math.max(0, t.classes_booked - 1), classes_remaining: t.classes_remaining + 1 }
          : t
      );
    }
  },
  async getAssessments(familyId) {
    return _assessments.filter(a => a.family_id === familyId);
  },
  async createAssessment(assessment) {
    const a: Assessment = { ...assessment, id: `a${Date.now()}` }; 
    _assessments = [..._assessments, a];
    return a;
  },
  async getPayments(familyId) {
    return _payments.filter(p => p.family_id === familyId);
  },
  async submitPayment(payment) {
    const p = { ...payment, id: `pay${Date.now()}`, created_at: new Date().toISOString() };
    _payments = [..._payments, p];
    return p;
  },
  async uploadPaymentProof(_paymentId, _file) {
    // mock: no-op — receipt_filename already stored on the payment record
  },
  async getPendingPayments() {
    return _payments.filter(p => p.status === 'pending');
  },
  async verifyPayment(paymentId, action) {
    _payments = _payments.map(p =>
      p.id === paymentId ? { ...p, status: action === 'approve' ? 'paid' : 'rejected' } : p
    );
    // If approving a term payment, activate the term for that family
    if (action === 'approve') {
      const payment = _payments.find(p => p.id === paymentId);
      if (payment?.type === 'term') {
        const now = new Date();
        const end = new Date(now); end.setDate(now.getDate() + 70);
        const fmt = (d: Date) => d.toISOString().slice(0, 10);
        const existing = _terms.find(t => t.family_id === payment.family_id && t.status === 'active');
        if (!existing) {
          _terms = [..._terms, {
            id: `t${Date.now()}`, family_id: payment.family_id, status: 'active',
            start_date: fmt(now), end_date: fmt(end),
            classes_included: 10, classes_booked: 0, classes_remaining: 10,
            payment,
          }];
        }
      }
    }
  },
  async getTeachers() {
    return mockTeachers;
  },
  async getClassInstances() {
    return _classInstances;
  },
  async createClassInstance(cls) {
    const c: ClassInstance = { ...cls, id: `ci${Date.now()}`, enrolled: 0 };
    _classInstances = [..._classInstances, c];
    return c;
  },
  async updateClassInstance(id, patch) {
    let updated: ClassInstance | undefined;
    _classInstances = _classInstances.map(c => {
      if (c.id !== id) return c;
      updated = { ...c, ...patch };
      return updated;
    });
    if (!updated) throw new Error(`ClassInstance ${id} not found`);
    return updated;
  },
  async deleteClassInstance(id) {
    _classInstances = _classInstances.filter(c => c.id !== id);
  },
  async getIndividualPurchases(familyId) {
    return _individualPurchases.filter(p => p.family_id === familyId);
  },
  async createIndividualPurchase(purchase) {
    const p: IndividualClassPurchase = { ...purchase, id: `ip${Date.now()}` };
    _individualPurchases = [..._individualPurchases, p];
    return p;
  },
  async getReports(teacherId) {
    return _reports.filter(r => r.teacher_id === teacherId);
  },
  async createReport(report) {
    const r: StudentReport = { ...report, id: `rpt${Date.now()}`, created_at: new Date().toISOString() };
    _reports = [..._reports, r];
    return r;
  },
  async getTeacherAssessments(teacherId) {
    return _assessments.filter(a => a.teacher_id === teacherId);
  },
  async createTeacherAssessment(assessment) {
    const a: Assessment = { ...assessment, id: `a${Date.now()}` };
    _assessments = [..._assessments, a];
    return a;
  },
  async getConversations(participantId) {
    return _conversations.filter(c => c.participant_ids.includes(participantId));
  },
  async getMessages(conversationId) {
    return _messages.filter(m => m.conversation_id === conversationId);
  },
  async sendMessage(msg) {
    const m: ChatMessage = { ...msg, id: `m${Date.now()}`, created_at: new Date().toISOString() };
    _messages = [..._messages, m];
    // Update conversation last_message
    _conversations = _conversations.map(c =>
      c.id === msg.conversation_id
        ? { ...c, last_message: msg.body, last_message_at: m.created_at }
        : c
    );
    return m;
  },
  async markConversationRead(conversationId) {
    _conversations = _conversations.map(c =>
      c.id === conversationId ? { ...c, unread_count: 0 } : c
    );
  },
  async getNotifications(familyId, teacherId) {
    return _notifications.filter(n =>
      (!n.family_id && !n.teacher_id) || // broadcast
      (familyId && n.family_id === familyId) ||
      (teacherId && n.teacher_id === teacherId)
    );
  },
  async markNotificationRead(notificationId) {
    _notifications = _notifications.map(n =>
      n.id === notificationId ? { ...n, read: true } : n
    );
  },
  async markAllNotificationsRead(familyId, teacherId) {
    _notifications = _notifications.map(n => {
      const mine = (!n.family_id && !n.teacher_id) ||
        (familyId && n.family_id === familyId) ||
        (teacherId && n.teacher_id === teacherId);
      return mine ? { ...n, read: true } : n;
    });
  },
  async getDocuments() {
    return { ..._documents };
  },
  async getShopProducts() {
    return _mockProducts;
  },
  async getShopOrders(familyId) {
    return _shopOrders.filter(o => o.family_id === familyId);
  },
  async getAllShopOrders() {
    return _shopOrders;
  },
  async placeOrder(familyId, familyName, items, paymentMethod, delivery, source, receiptFilename) {
    const orderItems = items.map((c: ShopCartItem) => ({
      product_id: c.product.id,
      title: c.product.title,
      price: c.product.price,
      quantity: c.quantity,
    }));
    const total = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);
    const order: ShopOrder = {
      id: `ord${Date.now()}`,
      family_id: familyId,
      family_name: familyName,
      source,
      items: orderItems,
      total,
      status: 'Pending',
      payment_method: paymentMethod,
      payment_status: paymentMethod === 'cod' ? 'unpaid' : 'pending_verification',
      receipt_filename: receiptFilename,
      delivery_name: delivery.name,
      delivery_address: delivery.address,
      delivery_phone: delivery.phone,
      delivery_email: delivery.email,
      created_at: new Date().toISOString(),
    };
    _shopOrders = [..._shopOrders, order];
    return order;
  },
  async verifyShopOrder(orderId, action) {
    _shopOrders = _shopOrders.map(o =>
      o.id === orderId
        ? { ...o, payment_status: action === 'approve' ? 'paid' : 'unpaid', status: action === 'approve' ? 'Processing' : 'Pending' }
        : o
    );
  },
  async uploadDocument(key, file) {
    // Revoke previous object URL to avoid memory leaks
    if (_documents[key]) URL.revokeObjectURL(_documents[key]);
    const url = URL.createObjectURL(file);
    _documents = { ..._documents, [key]: url };
    return url;
  },
};
