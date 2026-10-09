import type { AppSupabase } from '../../supabase';
import { toAppError } from '../errors';
import { rpc } from './rpc';
import { toClassSession } from './catalog';
import type { ClassBooking, BookingCancelResult } from '../../../types/booking';

function toBooking(r: any): ClassBooking {
  return {
    id: r.id,
    family_id: r.family_id,
    child_id: r.child_id,
    class_session_id: r.class_session_id,
    source: r.source,
    status: r.status,
    credit_consumed: r.credit_consumed ?? false,
    credit_restored: r.credit_restored ?? undefined,
    hold_expires_at: r.hold_expires_at ?? undefined,
    session: r.session ? toClassSession(r.session) : undefined,
    child: r.child ? { id: r.child.id, name: r.child.name, initials: r.child.initials } : undefined,
  };
}

const BOOKING_SELECT = '*, child:children(id,name,initials), session:class_sessions(*, class:classes(teacher_id, program:programs(name,color), teacher:teachers(name,color)))';

export function createBookingsMethods(sb: AppSupabase) {
  return {
    async getBookings(familyId: string): Promise<ClassBooking[]> {
      const { data, error } = await sb
        .from('class_bookings')
        .select(BOOKING_SELECT)
        .eq('family_id', familyId)
        .order('created_at', { ascending: false });
      if (error) throw toAppError(error);
      return (data ?? []).map(toBooking);
    },

    async getAllBookings(): Promise<ClassBooking[]> {
      const { data, error } = await sb
        .from('class_bookings')
        .select(BOOKING_SELECT)
        .order('created_at', { ascending: false });
      if (error) throw toAppError(error);
      return (data ?? []).map(toBooking);
    },

    async getBookingsForTeacher(): Promise<ClassBooking[]> {
      const { data, error } = await sb
        .from('class_bookings')
        .select(BOOKING_SELECT)
        .order('created_at', { ascending: false });
      if (error) throw toAppError(error);
      return (data ?? []).map(toBooking);
    },

    async bookClassSession(childId: string, sessionId: string): Promise<ClassBooking> {
      const raw = await rpc<any>(sb, 'book_class_session', {
        p_child_id: childId,
        p_session_id: sessionId,
      });
      return toBooking(raw);
    },

    async joinWaitlist(childId: string, sessionId: string): Promise<ClassBooking> {
      const raw = await rpc<any>(sb, 'join_waitlist', {
        p_child_id: childId,
        p_session_id: sessionId,
      });
      return toBooking(raw);
    },

    async cancelBooking(bookingId: string, opts?: { restoreCredit?: boolean }): Promise<BookingCancelResult> {
      const raw = await rpc<any>(sb, 'cancel_booking', {
        p_booking_id: bookingId,
        p_restore_credit: opts?.restoreCredit ?? null,
      });
      return {
        credit_restored: raw.credit_restored ?? false,
        within_window: raw.within_window ?? false,
      };
    },
  };
}
