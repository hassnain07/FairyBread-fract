import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { qk } from '../lib/data/queryKeys';
import { useAuth } from '../app/providers';

export function useRealtime(onToast: (n: { title: string; body: string; url?: string }) => void) {
  const qc = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const ch = supabase
      .channel(`user:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${user.id}` },
        p => {
          qc.invalidateQueries({ queryKey: qk.notifications });
          const n = p.new as any;
          onToast({ title: n.title, body: n.body, url: n.action_url });
          if (['booking_confirmed', 'booking_cancelled', 'session_cancelled', 'payment_approved', 'payment_rejected', 'term_expiring'].includes(n.type)) {
            qc.invalidateQueries({ queryKey: ['bookings'] });
            qc.invalidateQueries({ queryKey: ['terms'] });
            qc.invalidateQueries({ queryKey: ['payments'] });
          }
          if (n.type?.startsWith('shop_')) {
            qc.invalidateQueries({ queryKey: ['shopOrders'] });
            qc.invalidateQueries({ queryKey: ['allShopOrders'] });
            qc.invalidateQueries({ queryKey: qk.shopStats });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        p => {
          const m = p.new as any;
          qc.invalidateQueries({ queryKey: qk.messages(m.conversation_id) });
          qc.invalidateQueries({ queryKey: qk.conversations });
        }
      )
      .subscribe();

    return () => { void supabase.removeChannel(ch); };
  }, [user?.id, qc, onToast]);
}
