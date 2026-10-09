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
  };
}
