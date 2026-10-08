import type { Family, Child } from '../../types/family';
import type { Term } from '../../types/term';
import type { ClassBooking, Assessment, IndividualClassPurchase, StudentReport } from '../../types/booking';
import type { Payment, PaymentType } from '../../types/payment';
import type { Teacher, ClassInstance } from '../../types/teacher';
import type { Conversation, ChatMessage, AppNotification } from '../../types/message';
import type { ShopProduct, ShopCartItem, ShopOrder } from '../../types/shop';

export interface DataClient {
  // Families
  getFamily(familyId: string): Promise<Family>;
  getAllFamilies(): Promise<Family[]>;
  // Children
  getChildren(familyId: string): Promise<Child[]>;
  addChild(familyId: string, child: Omit<Child, 'id' | 'family_id'>): Promise<Child>;
  // Terms
  getTerms(familyId: string): Promise<Term[]>;
  getActiveTerm(familyId: string): Promise<Term | null>;
  // Bookings
  getBookings(familyId: string): Promise<ClassBooking[]>;
  createBooking(booking: Omit<ClassBooking, 'id'>): Promise<ClassBooking>;
  cancelBooking(bookingId: string): Promise<void>;
  // Assessments
  getAssessments(familyId: string): Promise<Assessment[]>;
  createAssessment(assessment: Omit<Assessment, 'id'>): Promise<Assessment>;
  // Individual class purchases — only available if family has >= 1 Term record (any status)
  getIndividualPurchases(familyId: string): Promise<IndividualClassPurchase[]>;
  createIndividualPurchase(purchase: Omit<IndividualClassPurchase, 'id'>): Promise<IndividualClassPurchase>;
  // Payments
  getPayments(familyId: string): Promise<Payment[]>;
  submitPayment(payment: Omit<Payment, 'id' | 'created_at'>): Promise<Payment>;
  uploadPaymentProof(paymentId: string, file: File): Promise<void>;
  // Admin — all pending payments across all families
  getPendingPayments(): Promise<Payment[]>;
  verifyPayment(paymentId: string, action: 'approve' | 'reject'): Promise<void>;
  // Teachers
  getTeachers(): Promise<Teacher[]>;
  // Classes
  getClassInstances(): Promise<ClassInstance[]>;
  createClassInstance(cls: Omit<ClassInstance, 'id' | 'enrolled'>): Promise<ClassInstance>;
  updateClassInstance(id: string, patch: Partial<Omit<ClassInstance, 'id'>>): Promise<ClassInstance>;
  deleteClassInstance(id: string): Promise<void>;
  // Reports
  getReports(teacherId: string): Promise<StudentReport[]>;
  createReport(report: Omit<StudentReport, 'id' | 'created_at'>): Promise<StudentReport>;
  // Teacher assessments
  getTeacherAssessments(teacherId: string): Promise<Assessment[]>;
  createTeacherAssessment(assessment: Omit<Assessment, 'id'>): Promise<Assessment>;
  // Messages
  getConversations(participantId: string): Promise<Conversation[]>;
  getMessages(conversationId: string): Promise<ChatMessage[]>;
  sendMessage(msg: Omit<ChatMessage, 'id' | 'created_at'>): Promise<ChatMessage>;
  markConversationRead(conversationId: string): Promise<void>;
  // Notifications
  getNotifications(familyId?: string, teacherId?: string): Promise<AppNotification[]>;
  markNotificationRead(notificationId: string): Promise<void>;
  markAllNotificationsRead(familyId?: string, teacherId?: string): Promise<void>;
  // Documents (Terms & Conditions, Privacy Policy)
  getDocuments(): Promise<Record<string, string>>; // key → URL
  uploadDocument(key: string, file: File): Promise<string>; // returns URL
  // Shop
  getShopProducts(): Promise<ShopProduct[]>;
  getShopOrders(familyId: string): Promise<ShopOrder[]>;
  getAllShopOrders(): Promise<ShopOrder[]>;
  placeOrder(
    familyId: string,
    familyName: string,
    items: ShopCartItem[],
    paymentMethod: 'cod' | 'advance',
    delivery: { name: string; address: string; phone: string; email: string },
    source: 'portal' | 'guest',
    receiptFilename?: string
  ): Promise<ShopOrder>;
  verifyShopOrder(orderId: string, action: 'approve' | 'reject'): Promise<void>;
  // Unused PaymentType re-export for consumers
  _paymentType?: PaymentType;
}
