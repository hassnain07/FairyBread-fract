import type { AppSupabase } from '../../supabase';
import { toAppError } from '../errors';
import { rpc } from './rpc';
import type { Term, SchoolTerm, GatingSnapshot } from '../../../types/term';

function toTerm(r: any): Term {
  return {
    id: r.id,
    family_id: r.family_id,
    status: r.status,
    term_label: r.term_label ?? undefined,
    start_date: r.start_date,
    end_date: r.end_date,
  };
}

function toSchoolTerm(r: any): SchoolTerm {
  return {
    id: r.id,
    label: r.label,
    start_date: r.start_date,
    end_date: r.end_date,
    is_active: r.is_active ?? true,
    created_at: r.created_at,
  };
}

export function createTermsMethods(sb: AppSupabase) {
  return {
    async getTerms(familyId: string): Promise<Term[]> {
      const { data, error } = await sb
        .from('terms')
        .select('id,family_id,status,term_label,start_date,end_date')
        .eq('family_id', familyId)
        .order('start_date');
      if (error) throw toAppError(error);
      return (data ?? []).map(toTerm);
    },

    async getAllTerms(): Promise<Term[]> {
      const { data, error } = await sb
        .from('terms')
        .select('id,family_id,status,term_label,start_date,end_date')
        .order('start_date');
      if (error) throw toAppError(error);
      return (data ?? []).map(toTerm);
    },

    async getSchoolTerms(): Promise<SchoolTerm[]> {
      const { data, error } = await sb
        .from('school_terms')
        .select('*')
        .order('start_date', { ascending: false });
      if (error) throw toAppError(error);
      return (data ?? []).map(toSchoolTerm);
    },

    async createSchoolTerm(label: string, startDate: string, endDate: string): Promise<SchoolTerm> {
      const raw = await rpc<any>(sb, 'admin_create_school_term', {
        p_label: label,
        p_start_date: startDate,
        p_end_date: endDate,
      });
      return toSchoolTerm(raw);
    },

    async adminAdjustCredits(termId: string, delta: number, note: string): Promise<Term> {
      const raw = await rpc<any>(sb, 'admin_adjust_credits', {
        p_term_id: termId,
        p_delta: delta,
        p_note: note,
      });
      return toTerm(raw);
    },

    async getGating(familyId: string): Promise<GatingSnapshot> {
      const raw = await rpc<any>(sb, 'get_family_gating', { p_family_id: familyId });
      return {
        state: raw.state,
        active_term_id: raw.active_term_id ?? undefined,
        classes_remaining: raw.classes_remaining ?? 0,
        end_date: raw.end_date ?? undefined,
      };
    },
  };
}
