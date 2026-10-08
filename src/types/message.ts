export type MessageSenderRole = 'parent' | 'admin' | 'teacher' | 'system';

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
  participant_ids: string[]; // familyId or teacherId or 'admin'
  participant_names: string[];
  participant_roles: MessageSenderRole[];
  last_message: string;
  last_message_at: string;
  unread_count: number;
  avatar_color: string;
}

export type NotificationType =
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'payment_received'
  | 'payment_approved'
  | 'payment_rejected'
  | 'assessment_confirmed'
  | 'term_expiring'
  | 'report_ready'
  | 'message_received'
  | 'announcement';

export interface AppNotification {
  id: string;
  family_id?: string;   // undefined = broadcast to all
  teacher_id?: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  action_url?: string;  // e.g. '/parent/payments'
}
