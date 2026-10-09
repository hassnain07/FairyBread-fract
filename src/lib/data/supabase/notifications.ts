import type { AppSupabase } from '../../supabase';
import { toAppError } from '../errors';
import { rpc } from './rpc';
import type { AppNotification, NotificationCategory } from '../../../types/message';

function mapNotification(r: any): AppNotification {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    read: !!r.read_at,
    created_at: r.created_at,
    action_url: r.action_url ?? undefined,
    data: r.data ?? {},
  };
}

export function createNotificationsMethods(sb: AppSupabase) {
  return {
    async getNotifications(limit = 50): Promise<AppNotification[]> {
      const { data, error } = await sb
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw toAppError(error);
      return (data ?? []).map(mapNotification);
    },

    async markNotificationRead(id: string): Promise<void> {
      const { error } = await sb
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw toAppError(error);
    },

    async markAllNotificationsRead(): Promise<void> {
      await rpc(sb, 'mark_all_notifications_read');
    },

    async getNotificationPrefs(): Promise<Record<NotificationCategory, { push: boolean; inApp: boolean }>> {
      const { data, error } = await sb
        .from('notification_preferences')
        .select('category, push_enabled, in_app_enabled');
      if (error) throw toAppError(error);
      const defaults: Record<NotificationCategory, { push: boolean; inApp: boolean }> = {
        new_bookings: { push: true, inApp: true },
        cancellations: { push: true, inApp: true },
        payments: { push: true, inApp: true },
        reports: { push: true, inApp: true },
        reminders: { push: true, inApp: true },
        messages: { push: true, inApp: true },
        announcements: { push: false, inApp: true },
        orders: { push: true, inApp: true },
      };
      for (const row of data ?? []) {
        const cat = row.category as NotificationCategory;
        if (cat in defaults) {
          defaults[cat] = { push: row.push_enabled ?? true, inApp: row.in_app_enabled ?? true };
        }
      }
      return defaults;
    },

    async setNotificationPref(category: NotificationCategory, v: { push?: boolean; inApp?: boolean }): Promise<void> {
      const { error } = await sb.from('notification_preferences').upsert({
        category,
        ...(v.push !== undefined ? { push_enabled: v.push } : {}),
        ...(v.inApp !== undefined ? { in_app_enabled: v.inApp } : {}),
      });
      if (error) throw toAppError(error);
    },

    async registerDevice(token: string, platform: 'web' | 'ios' | 'android', meta?: { appVersion?: string; locale?: string }): Promise<void> {
      await rpc(sb, 'register_device', {
        p_token: token,
        p_platform: platform,
        p_app_version: meta?.appVersion ?? null,
        p_locale: meta?.locale ?? null,
      });
    },

    async unregisterDevice(token: string): Promise<void> {
      await rpc(sb, 'unregister_device', { p_token: token });
    },
  };
}
