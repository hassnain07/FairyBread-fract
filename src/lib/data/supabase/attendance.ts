import type { AppSupabase } from '../../supabase';
import { toAppError } from '../errors';
import { rpc } from './rpc';
import type { AttendanceRecord } from '../../../types/booking';

function toRecord(r: any): AttendanceRecord {
  return {
    class_session_id: r.class_session_id,
    child_id: r.child_id,
    status: r.status,
  };
}

export function createAttendanceMethods(sb: AppSupabase) {
  return {
    async getAttendance(sessionId: string): Promise<AttendanceRecord[]> {
      const { data, error } = await sb
        .from('attendance')
        .select('class_session_id, child_id, status')
        .eq('class_session_id', sessionId);
      if (error) throw toAppError(error);
      return (data ?? []).map(toRecord);
    },

    async getChildAttendance(childId: string): Promise<AttendanceRecord[]> {
      const { data, error } = await sb
        .from('attendance')
        .select('class_session_id, child_id, status')
        .eq('child_id', childId)
        .order('class_session_id', { ascending: false });
      if (error) throw toAppError(error);
      return (data ?? []).map(toRecord);
    },

    async saveAttendance(
      sessionId: string,
      records: Array<{ childId: string; status: AttendanceRecord['status'] }>
    ): Promise<number> {
      return rpc<number>(sb, 'save_attendance', {
        p_session_id: sessionId,
        p_records: records.map(r => ({ child_id: r.childId, status: r.status })),
      });
    },
  };
}
