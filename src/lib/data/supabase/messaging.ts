import type { AppSupabase } from '../../supabase';
import { toAppError } from '../errors';
import { rpc } from './rpc';
import type { Conversation, ChatMessage, ConversationKind } from '../../../types/message';

// Stable colour from a string (conversation id)
function avatarColor(id: string): string {
  const colours = ['pink', 'teal', 'yellow', 'orange', 'green'];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return colours[h % colours.length];
}

function mapConversation(r: any, viewerRole: 'parent' | 'teacher' | 'admin'): Conversation {
  let title = r.title ?? r.other_name ?? '';
  if (!title) {
    if (r.kind === 'parent_staff') {
      // Parent sees the business name; admin sees the family name
      title = viewerRole === 'parent' ? 'Fairybread & Fractions' : (r.family_name ?? 'Family');
    } else if (r.kind === 'teacher_staff') {
      // Teacher sees the business name; admin sees the teacher name
      title = viewerRole === 'teacher' ? 'Fairybread & Fractions' : (r.teacher_name ?? 'Teacher');
    } else {
      // parent_teacher: parent sees teacher name, teacher sees family name
      title = viewerRole === 'parent' ? (r.teacher_name ?? 'Teacher') : (r.family_name ?? 'Family');
    }
  }
  return {
    id: r.id,
    kind: r.kind,
    title,
    last_message: r.last_message ?? r.last_message_preview ?? '',
    last_message_at: r.last_message_at ?? r.created_at,
    unread_count: r.unread_count ?? 0,
    avatar_color: r.avatar_color ?? avatarColor(r.id),
    family_id: r.family_id ?? undefined,
    teacher_id: r.teacher_id ?? undefined,
  };
}

function mapMessage(r: any): ChatMessage {
  return {
    id: r.id,
    conversation_id: r.conversation_id,
    sender_role: r.sender_role,
    sender_name: r.sender_name ?? '',
    body: r.body,
    created_at: r.created_at,
    is_reminder: r.is_reminder ?? false,
  };
}

export function createMessagingMethods(sb: AppSupabase) {
  return {
    async getConversations(): Promise<Conversation[]> {
      const ctx = await rpc<Record<string, unknown>>(sb, 'get_my_context').catch(() => null);
      const rawRole = ctx?.role as string | undefined;
      const viewerRole: 'parent' | 'teacher' | 'admin' =
        rawRole === 'admin' ? 'admin' : rawRole === 'teacher' ? 'teacher' : 'parent';
      const rows = await rpc<any[]>(sb, 'get_conversations');
      return (rows ?? []).map(r => mapConversation(r, viewerRole));
    },

    async startConversation(kind: ConversationKind, target: { familyId?: string; teacherId?: string }): Promise<string> {
      const id = await rpc<string>(sb, 'start_conversation', {
        p_kind: kind,
        p_family_id: target.familyId ?? null,
        p_teacher_id: target.teacherId ?? null,
      });
      return id;
    },

    async getMessages(conversationId: string): Promise<ChatMessage[]> {
      const { data, error } = await sb
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at');
      if (error) throw toAppError(error);
      return (data ?? []).map(mapMessage);
    },

    async sendMessage(conversationId: string, body: string): Promise<ChatMessage> {
      const row = await rpc<any>(sb, 'send_message', {
        p_conversation_id: conversationId,
        p_body: body,
      });
      return mapMessage(row);
    },

    async markConversationRead(conversationId: string): Promise<void> {
      await rpc(sb, 'mark_conversation_read', { p_conversation_id: conversationId });
    },
  };
}
