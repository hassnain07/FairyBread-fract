import type { Conversation, ChatMessage, AppNotification } from '../../../types/message';

const now = new Date();
const mins = (n: number) => new Date(now.getTime() - n * 60_000).toISOString();
const hrs = (n: number) => new Date(now.getTime() - n * 3_600_000).toISOString();
const days = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

// ─── Conversations ────────────────────────────────────────────────────────────
export const mockConversations: Conversation[] = [
  // f1 (Sarah Johnson) ↔ Admin
  {
    id: 'conv1', participant_ids: ['f1', 'admin'], participant_names: ['Sarah Johnson', 'Fairybread & Fractions'],
    participant_roles: ['parent', 'admin'], last_message: "Emma's assessment has been confirmed!", last_message_at: mins(5),
    unread_count: 1, avatar_color: 'pink',
  },
  // f1 (Sarah Johnson) ↔ tch1 (Jessica Taylor)
  {
    id: 'conv2', participant_ids: ['f1', 'tch1'], participant_names: ['Sarah Johnson', 'Jessica Taylor'],
    participant_roles: ['parent', 'teacher'], last_message: 'Emma did a fantastic job with fractions today.', last_message_at: days(1),
    unread_count: 0, avatar_color: 'yellow',
  },
  // f2 (Claire Brown) ↔ Admin
  {
    id: 'conv3', participant_ids: ['f2', 'admin'], participant_names: ['Claire Brown', 'Fairybread & Fractions'],
    participant_roles: ['parent', 'admin'], last_message: 'Your next term payment is due soon.', last_message_at: days(2),
    unread_count: 1, avatar_color: 'teal',
  },
  // f3 (James Taylor) ↔ Admin
  {
    id: 'conv4', participant_ids: ['f3', 'admin'], participant_names: ['James Taylor', 'Fairybread & Fractions'],
    participant_roles: ['parent', 'admin'], last_message: 'Hi! Just checking in about re-enrolling for next term.', last_message_at: days(3),
    unread_count: 0, avatar_color: 'orange',
  },
  // tch1 (Jessica Taylor) ↔ f1 (Sarah Johnson) — same as conv2 but from teacher perspective
  // tch1 ↔ Admin
  {
    id: 'conv5', participant_ids: ['tch1', 'admin'], participant_names: ['Jessica Taylor', 'Admin'],
    participant_roles: ['teacher', 'admin'], last_message: 'Timetable update for next term.', last_message_at: days(1),
    unread_count: 0, avatar_color: 'teal',
  },
];

// ─── Messages ─────────────────────────────────────────────────────────────────
export const mockMessages: ChatMessage[] = [
  // conv1 — f1 ↔ Admin (assessment confirmation)
  { id: 'm1', conversation_id: 'conv1', sender_role: 'admin', sender_name: 'Fairybread & Fractions', body: "Hi Sarah! Emma's assessment has been confirmed for Tuesday 14 October at 3:30 PM.", created_at: mins(5), is_reminder: true },
  { id: 'm2', conversation_id: 'conv1', sender_role: 'parent', sender_name: 'Sarah Johnson', body: "Wonderful, thank you. We're looking forward to it!", created_at: mins(3) },
  { id: 'm3', conversation_id: 'conv1', sender_role: 'admin', sender_name: 'Fairybread & Fractions', body: "We can't wait to meet her. See you then! 🎉", created_at: mins(2) },

  // conv2 — f1 ↔ tch1 (Jessica Taylor)
  { id: 'm4', conversation_id: 'conv2', sender_role: 'teacher', sender_name: 'Jessica Taylor', body: "Hi Sarah! Emma did a fantastic job with fractions today. She's really starting to click with equivalent fractions.", created_at: days(1) },
  { id: 'm5', conversation_id: 'conv2', sender_role: 'parent', sender_name: 'Sarah Johnson', body: "That's so great to hear! She was telling me about the pizza slices example 😄", created_at: hrs(22) },
  { id: 'm6', conversation_id: 'conv2', sender_role: 'teacher', sender_name: 'Jessica Taylor', body: "Ha! Yes, that one always works. I'll send through some practice sheets for the week.", created_at: hrs(21) },

  // conv3 — f2 ↔ Admin (payment reminder)
  { id: 'm7', conversation_id: 'conv3', sender_role: 'admin', sender_name: 'Fairybread & Fractions', body: "Hi Claire! Just a friendly reminder that your term payment is due soon. Let us know if you have any questions.", created_at: days(2), is_reminder: true },
  { id: 'm8', conversation_id: 'conv3', sender_role: 'parent', sender_name: 'Claire Brown', body: "Thanks for the reminder! I'll get that sorted today.", created_at: days(2) },

  // conv4 — f3 ↔ Admin (re-enrolment)
  { id: 'm9', conversation_id: 'conv4', sender_role: 'parent', sender_name: 'James Taylor', body: "Hi! Just checking in about re-enrolling Liam and Mia for next term.", created_at: days(3) },
  { id: 'm10', conversation_id: 'conv4', sender_role: 'admin', sender_name: 'Fairybread & Fractions', body: "Hi James! Great to hear from you. We'd love to have them back. I'll send through the enrolment link shortly.", created_at: days(3) },

  // conv5 — tch1 ↔ Admin
  { id: 'm11', conversation_id: 'conv5', sender_role: 'admin', sender_name: 'Admin', body: "Hi Jessica! Just a heads up — the timetable for next term has been updated. Monday 3:30 PM class moves to 4:00 PM.", created_at: days(1) },
  { id: 'm12', conversation_id: 'conv5', sender_role: 'teacher', sender_name: 'Jessica Taylor', body: "Got it, thanks for letting me know! I'll update my calendar.", created_at: days(1) },
];

// ─── Notifications ────────────────────────────────────────────────────────────
export const mockNotifications: AppNotification[] = [
  // f1 notifications
  { id: 'n1', family_id: 'f1', type: 'assessment_confirmed', title: 'Assessment confirmed', body: "Emma's assessment is booked for Tuesday 14 Oct at 3:30 PM.", read: false, created_at: mins(5), action_url: '/parent/messages' },
  { id: 'n2', family_id: 'f1', type: 'report_ready', title: 'New report available', body: "Emma's progress report from Jessica Taylor is ready to view.", read: false, created_at: hrs(3), action_url: '/parent/reports' },
  { id: 'n3', family_id: 'f1', type: 'booking_confirmed', title: 'Class booked', body: "Oliver's Wednesday English class has been confirmed.", read: true, created_at: days(1), action_url: '/parent/bookings' },
  { id: 'n4', family_id: 'f1', type: 'payment_approved', title: 'Payment approved', body: "Your Term 3 payment has been verified. 10 credits added.", read: true, created_at: days(14), action_url: '/parent/payments' },

  // f2 notifications
  { id: 'n5', family_id: 'f2', type: 'term_expiring', title: 'Credits exhausted', body: "Sophie has used all 10 term credits. Purchase individual classes or renew your term.", read: false, created_at: hrs(1), action_url: '/parent/book-class' },
  { id: 'n6', family_id: 'f2', type: 'message_received', title: 'New message', body: "Fairybread & Fractions sent you a message about your upcoming payment.", read: false, created_at: days(2), action_url: '/parent/messages' },

  // f3 notifications
  { id: 'n7', family_id: 'f3', type: 'term_expiring', title: 'Term expired', body: "Your term ended 2 weeks ago. Renew to keep Liam and Mia's spots.", read: false, created_at: days(14), action_url: '/parent/payments' },

  // f4 notifications
  { id: 'n8', family_id: 'f4', type: 'announcement', title: 'Welcome to Fairybread & Fractions!', body: "We're so excited to have Noah join us. Complete your enrolment to get started.", read: false, created_at: days(1), action_url: '/parent/enrolment' },

  // Teacher notifications (tch1)
  { id: 'n9', teacher_id: 'tch1', type: 'booking_confirmed', title: 'New student booked', body: "Emma Johnson has booked your Monday Mathematics class.", read: false, created_at: hrs(2), action_url: '/teacher/students' },
  { id: 'n10', teacher_id: 'tch1', type: 'message_received', title: 'New message from Sarah Johnson', body: "Emma did a fantastic job today — parent replied to your message.", read: true, created_at: days(1), action_url: '/teacher/messages' },

  // Broadcast (all roles see this)
  { id: 'n11', type: 'announcement', title: 'Term 4 enrolments open', body: "Term 4 2025 enrolments are now open. Secure your spot early!", read: false, created_at: days(2), action_url: '/parent/enrolment' },
];
