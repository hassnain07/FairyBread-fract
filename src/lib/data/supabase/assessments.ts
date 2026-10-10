import type { AppSupabase } from '../../supabase';
import { toAppError } from '../errors';
import type { Assessment } from '../../../types/booking';

function toAssessment(r: any): Assessment {
  const a: Assessment = {
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
  // Preserve joined relations so the UI can display names instead of IDs
  if (r.child)   (a as any).child   = r.child;
  if (r.teacher) (a as any).teacher = r.teacher;
  return a;
}

const ASSESSMENT_SELECT = '*, child:children(id,name,given_name,family_id,enrolled_at), teacher:teachers(id,name)';

export function createAssessmentsMethods(sb: AppSupabase) {
  return {
    async getAssessments(familyId: string): Promise<Assessment[]> {
      const { data, error } = await sb
        .from('assessments')
        .select(ASSESSMENT_SELECT)
        .eq('family_id', familyId)
        .order('created_at', { ascending: false });
      if (error) throw toAppError(error);
      return (data ?? []).map(toAssessment);
    },

    // All assessments for unenrolled students (payment_id is set = parent booked & paid)
    async getAdminNewStudentAssessments(): Promise<Assessment[]> {
      const { data, error } = await sb
        .from('assessments')
        .select(ASSESSMENT_SELECT)
        .not('payment_id', 'is', null)
        .order('created_at', { ascending: false });
      if (error) throw toAppError(error);
      return (data ?? []).map(toAssessment);
    },

    // All assessments created by admin for enrolled students (payment_id is null)
    async getAdminTermAssessments(): Promise<Assessment[]> {
      const { data, error } = await sb
        .from('assessments')
        .select(ASSESSMENT_SELECT)
        .is('payment_id', null)
        .order('scheduled_date', { ascending: true });
      if (error) throw toAppError(error);
      return (data ?? []).map(toAssessment);
    },

    async adminCreateTermAssessment(input: {
      childId: string;
      teacherId: string;
      date: string;
      time: string;
    }): Promise<Assessment> {
      const { data, error } = await sb.rpc('admin_create_term_assessment', {
        p_child_id: input.childId,
        p_teacher_id: input.teacherId,
        p_date: input.date,
        p_time: input.time,
      });
      if (error) throw toAppError(error);
      return toAssessment(data);
    },

    async adminCreateSubjectAssessments(input: {
      programId: string;
      date: string;
      time: string;
    }): Promise<{ count: number; teacher: string; program: string }> {
      const { data, error } = await sb.rpc('admin_create_subject_assessments', {
        p_program_id: input.programId,
        p_date: input.date,
        p_time: input.time,
      });
      if (error) throw toAppError(error);
      return data as { count: number; teacher: string; program: string };
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
