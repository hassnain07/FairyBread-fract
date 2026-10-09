import type { Family, Child, NewChild, ChildPatch, EnrolmentInput } from '../../types/family';
import type { Term, GatingSnapshot } from '../../types/term';
import type { ClassBooking, BookingCancelResult, Assessment, StudentReport, NewReport, AttendanceRecord, IndividualClassPurchase } from '../../types/booking';
import type { Payment, PaymentIntent, PriceQuote } from '../../types/payment';
import type { Teacher, ClassSlot, ClassSession, ClassSlotInput, Program, ClassInstance } from '../../types/teacher';
import type { Conversation, ChatMessage, AppNotification } from '../../types/message';
import type { ShopProduct, ShopOrder, ShopCartItem } from '../../types/shop';
import type { AuthUser } from '../../types/auth';
import type { AdminStats, Closure } from '../../types/admin';

export interface DataClient {
  // ── Auth ──────────────────────────────────────────────────────────────────
  signIn(email: string, password: string): Promise<AuthUser>;
  requestSignupOtp(input: { email: string; firstName: string; lastName: string; phone?: string }): Promise<void>;
  requestPasswordResetOtp(email: string): Promise<void>;
  verifyOtp(email: string, code: string, purpose: 'signup' | 'recovery'): Promise<void>;
  setPassword(newPassword: string): Promise<void>;
  signOut(): Promise<void>;
  getMyContext(): Promise<AuthUser | null>;
  onAuthChange(cb: (event: 'SIGNED_IN' | 'SIGNED_OUT' | 'PASSWORD_RECOVERY' | 'TOKEN_REFRESHED') => void): () => void;

  // ── Settings / content ────────────────────────────────────────────────────
  getSettings(): Promise<Record<string, unknown>>;
  updateSetting(key: string, value: unknown): Promise<void>;
  getDocuments(): Promise<Record<string, string>>; // key → public URL
  uploadDocument(key: string, file: File): Promise<string>;

  // ── Families & children ───────────────────────────────────────────────────
  getFamily(familyId: string): Promise<Family>;
  getAllFamilies(): Promise<Family[]>;
  getChildren(familyId: string): Promise<Child[]>;
  getAllChildren(): Promise<Child[]>;
  addChild(familyId: string, child: NewChild): Promise<Child>;
  updateChild(childId: string, patch: ChildPatch): Promise<Child>;
  completeEnrolment(childId: string, input: EnrolmentInput): Promise<Child>;

  // ── Terms & gating ────────────────────────────────────────────────────────
  getTerms(familyId: string): Promise<Term[]>;
  getAllTerms(): Promise<Term[]>;
  getGating(familyId: string): Promise<GatingSnapshot>;

  // ── Catalog & sessions ────────────────────────────────────────────────────
  getTeachers(): Promise<Teacher[]>;
  getPrograms(): Promise<Program[]>;
  upsertProgram(p: { id?: string; name: string; description?: string; color?: string; is_active?: boolean }): Promise<Program>;
  getClassSlots(): Promise<ClassSlot[]>;
  createClassSlot(input: ClassSlotInput): Promise<ClassSlot>;
  updateClassSlot(id: string, patch: Partial<ClassSlotInput>): Promise<ClassSlot>;
  deactivateClassSlot(id: string, cancelFuture?: boolean): Promise<number>;
  getUpcomingSessions(opts?: { from?: string; to?: string; classId?: string; teacherId?: string }): Promise<ClassSession[]>;
  cancelSession(sessionId: string, reason?: string): Promise<number>;
  getClosures(): Promise<Closure[]>;
  upsertClosure(c: { id?: string; date: string; label: string }): Promise<Closure>;
  deleteClosure(id: string): Promise<void>;

  // ── Bookings ──────────────────────────────────────────────────────────────
  getBookings(familyId: string): Promise<ClassBooking[]>;
  getAllBookings(): Promise<ClassBooking[]>;
  getBookingsForTeacher(): Promise<ClassBooking[]>;
  getWaitingList(): Promise<ClassBooking[]>;
  bookClassSession(childId: string, sessionId: string): Promise<ClassBooking>;
  joinWaitlist(childId: string, sessionId: string): Promise<ClassBooking>;
  cancelBooking(bookingId: string, opts?: { restoreCredit?: boolean }): Promise<BookingCancelResult>;

  // ── Payments ──────────────────────────────────────────────────────────────
  getPriceQuote(type: Payment['type'], familyId: string): Promise<PriceQuote>;
  getPayments(familyId: string): Promise<Payment[]>;
  getAllPayments(opts?: { status?: Payment['status'] }): Promise<Payment[]>;
  submitPayment(intent: PaymentIntent, proof: File): Promise<Payment>;
  getProofUrl(paymentId: string): Promise<string>;
  getPendingPayments(): Promise<Payment[]>;
  verifyPayment(paymentId: string, action: 'approve' | 'reject', note?: string): Promise<Payment>;
  adminRecordPayment(input: { familyId: string; type: 'term' | 'individual_class'; childId?: string; sessionId?: string; note?: string }): Promise<Payment>;

  // ── Assessments ───────────────────────────────────────────────────────────
  getAssessments(familyId: string): Promise<Assessment[]>;
  getTeacherAssessments(): Promise<Assessment[]>;
  createTeacherAssessments(rows: Array<{ childId: string; classId?: string; date: string; time: string }>): Promise<Assessment[]>;
  updateAssessment(id: string, patch: Partial<Pick<Assessment, 'status' | 'scheduled_date' | 'scheduled_time' | 'notes'>>): Promise<Assessment>;

  // ── Reports & attendance ──────────────────────────────────────────────────
  getReportsForChild(childId: string): Promise<StudentReport[]>;
  getTeacherReports(): Promise<StudentReport[]>;
  createReport(report: NewReport): Promise<StudentReport>;
  getAttendance(sessionId: string): Promise<AttendanceRecord[]>;
  getChildAttendance(childId: string): Promise<AttendanceRecord[]>;
  saveAttendance(sessionId: string, records: Array<{ childId: string; status: AttendanceRecord['status'] }>): Promise<number>;

  // ── Messages ──────────────────────────────────────────────────────────────
  getConversations(participantId: string): Promise<Conversation[]>;
  getMessages(conversationId: string): Promise<ChatMessage[]>;
  sendMessage(msg: Omit<ChatMessage, 'id' | 'created_at'>): Promise<ChatMessage>;
  markConversationRead(conversationId: string): Promise<void>;

  // ── Notifications ─────────────────────────────────────────────────────────
  getNotifications(familyId?: string, teacherId?: string): Promise<AppNotification[]>;
  markNotificationRead(notificationId: string): Promise<void>;
  markAllNotificationsRead(familyId?: string, teacherId?: string): Promise<void>;

  // ── Shop ──────────────────────────────────────────────────────────────────
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

  // ── Admin ─────────────────────────────────────────────────────────────────
  getAdminStats(): Promise<AdminStats>;
  inviteStaff(input: { email: string; fullName: string; role: 'teacher' | 'admin'; subjects?: string[]; color?: string }): Promise<void>;
  createFamily(input: { parentName: string; email?: string; phone?: string }): Promise<Family>;
  adminMarkEnrolled(childId: string, note?: string): Promise<Child>;
  adminAdjustCredits(termId: string, delta: number, note: string): Promise<Term>;

  // ── Legacy (unmigrated phases) ────────────────────────────────────────────
  getActiveTerm(familyId: string): Promise<Term | null>;
  getClassInstances(): Promise<ClassInstance[]>;
  createClassInstance(cls: Omit<ClassInstance, 'id' | 'enrolled'>): Promise<ClassInstance>;
  updateClassInstance(id: string, patch: Partial<Omit<ClassInstance, 'id'>>): Promise<ClassInstance>;
  deleteClassInstance(id: string): Promise<void>;
  getIndividualPurchases(familyId: string): Promise<IndividualClassPurchase[]>;
  createIndividualPurchase(purchase: Omit<IndividualClassPurchase, 'id'>): Promise<IndividualClassPurchase>;
}
