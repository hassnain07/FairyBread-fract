export type MessageSenderRole = 'parent' | 'admin' | 'teacher' | 'system';
export type ConversationKind = 'parent_staff' | 'parent_teacher' | 'teacher_staff';
export type NotificationCategory = 'new_bookings' | 'cancellations' | 'payments' | 'reports' | 'reminders' | 'messages' | 'announcements' | 'orders';

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_role: MessageSenderRole;
  sender_name: string;
  body: string;
  created_at: string;
  is_reminder?: boolean;
}

export interface Conversation {
  id: string;
  kind: ConversationKind;
  title: string;           // the other party's name
  last_message: string;
  last_message_at: string;
  unread_count: number;
  avatar_color: string;
  family_id?: string;
  teacher_id?: string;
}

export type NotificationType =
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'session_cancelled'
  | 'waitlist_spot_open'
  | 'payment_received'
  | 'payment_approved'
  | 'payment_rejected'
  | 'assessment_confirmed'
  | 'term_expiring'
  | 'session_reminder'
  | 'report_ready'
  | 'message_received'
  | 'enrolment_completed'
  | 'announcement'
  | 'shop_order_received'
  | 'shop_payment_approved'
  | 'shop_payment_rejected'
  | 'shop_order_update';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  action_url?: string;
  data: Record<string, unknown>;
}
