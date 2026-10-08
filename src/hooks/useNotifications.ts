import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dataClient } from '../lib/data/client';

export function useNotifications(familyId?: string, teacherId?: string) {
  const qc = useQueryClient();
  const key = ['notifications', familyId, teacherId];

  const { data: notifications = [] } = useQuery({
    queryKey: key,
    queryFn: () => dataClient.getNotifications(familyId, teacherId),
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const markRead = useMutation({
    mutationFn: (id: string) => dataClient.markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const markAllRead = useMutation({
    mutationFn: () => dataClient.markAllNotificationsRead(familyId, teacherId),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return { notifications, unreadCount, markRead, markAllRead };
}
