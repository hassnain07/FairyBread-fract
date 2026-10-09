import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dataClient } from '../lib/data/client';
import { qk } from '../lib/data/queryKeys';
import { useAuth } from '../app/providers';
import type { AppNotification } from '../types/message';

export function useNotifications() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const q = useQuery({
    queryKey: qk.notifications,
    queryFn: () => dataClient.getNotifications!(),
    enabled: !!user,
  });

  const notifications: AppNotification[] = q.data ?? [];
  const unreadCount = notifications.filter(n => !n.read).length;

  const markRead = useMutation({
    mutationFn: (id: string) => dataClient.markNotificationRead!(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: qk.notifications });
      const prev = qc.getQueryData<AppNotification[]>(qk.notifications);
      qc.setQueryData<AppNotification[]>(qk.notifications, p =>
        p?.map(n => n.id === id ? { ...n, read: true } : n)
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => ctx?.prev && qc.setQueryData(qk.notifications, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });

  const markAllRead = useMutation({
    mutationFn: () => dataClient.markAllNotificationsRead!(),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });

  return { notifications, unreadCount, markRead, markAllRead, isLoading: q.isLoading };
}
