import type { AppSupabase } from '../../supabase';
import { toAppError } from '../errors';
import type { Assessment } from '../../../types/booking';

function toAssessment(r: any): Assessment {
  return {
    id: r.id,
    family_id: r.family_id,
    child_id: r.child_id,
    teacher_id: r.teacher_id ?? undefined,
    class_id: r.class_id ?? undefined,
    scheduled_date: r.scheduled_date ?? undefined,
    scheduled_time: r.scheduled_time ?? undefined,
    status: r.status,
    payment_id: r.payment_id ?? undefined,
    notes: r.notes ?? undefined,
  };
}

export function createAssessmentsMethods(sb: AppSupabase) {
  return {
    async getAssessments(familyId: string): Promise<Assessment[]> {
      const { data, error } = await sb
        .from('assessments')
        .select('*')
        .eq('family_id', familyId)
        .order('created_at', { ascending: false });
      if (error) throw toAppError(error);
      return (data ?? []).map(toAssessment);
    },

    async getTeacherAssessments(): Promise<Assessment[]> {
      const { data, error } = await sb
        .from('assessments')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw toAppError(error);
      return (data ?? []).map(toAssessment);
    },

    async createTeacherAssessments(
      rows: Array<{ childId: string; classId?: string; date: string; time: string }>
    ): Promise<Assessment[]> {
      const { data, error } = await sb
        .from('assessments')
        .insert(rows.map(r => ({
          child_id: r.childId,
          class_id: r.classId ?? null,
          scheduled_date: r.date,
          scheduled_time: r.time,
          status: 'scheduled',
        })))
        .select();
      if (error) throw toAppError(error);
      return (data ?? []).map(toAssessment);
    },

    async updateAssessment(
      id: string,
      patch: Partial<Pick<Assessment, 'status' | 'scheduled_date' | 'scheduled_time' | 'notes'>>
    ): Promise<Assessment> {
      const { data, error } = await sb
        .from('assessments')
        .update({
          ...(patch.status !== undefined && { status: patch.status }),
          ...(patch.scheduled_date !== undefined && { scheduled_date: patch.scheduled_date }),
          ...(patch.scheduled_time !== undefined && { scheduled_time: patch.scheduled_time }),
          ...(patch.notes !== undefined && { notes: patch.notes }),
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw toAppError(error);
      return toAssessment(data);
    },
  };
}
