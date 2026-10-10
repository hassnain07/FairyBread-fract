import type { AppSupabase } from '../../supabase';
import { toAppError } from '../errors';
import type { StudentReport, NewReport } from '../../../types/booking';

function toReport(r: any): StudentReport {
  return {
    id: r.id,
    child_id: r.child_id,
    teacher_id: r.teacher_id,
    term: r.term,
    overall: r.overall,
    subjects: r.subjects ?? [],
    strengths: r.strengths ?? '',
    areas: r.areas ?? '',
    note: r.note ?? '',
    created_at: r.created_at,
  };
}

export function createReportsMethods(sb: AppSupabase) {
  return {
    async getReportsForChild(childId: string): Promise<StudentReport[]> {
      const { data, error } = await sb
        .from('student_reports')
        .select('*')
        .eq('child_id', childId)
        .order('created_at');
      if (error) throw toAppError(error);
      return (data ?? []).map(toReport);
    },

    async getTeacherReports(): Promise<StudentReport[]> {
      const { data, error } = await sb
        .from('student_reports')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw toAppError(error);
      return (data ?? []).map(toReport);
    },

    async createReport(report: NewReport): Promise<StudentReport> {
      const { data, error } = await sb
        .from('student_reports')
        .insert({
          child_id: report.child_id,
          teacher_id: report.teacher_id,
          term_label: report.term,
          overall: report.overall,
          subjects: report.subjects,
          strengths: report.strengths,
          areas: report.areas,
          note: report.note,
        })
        .select()
        .single();
      if (error) throw toAppError(error);
      return toReport(data);
    },
  };
}
