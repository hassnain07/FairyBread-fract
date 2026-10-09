import type { AppSupabase } from '../../supabase';
import { toAppError } from '../errors';
import { rpc } from './rpc';
import { toChild } from './mappers';
import type { Family, NewChild, ChildPatch, EnrolmentInput, Child } from '../../../types/family';

function toFamily(r: any): Family {
  return {
    id: r.id,
    reference_code: r.reference_code ?? '',
    parent_name: r.parent_name ?? '',
    email: r.email ?? undefined,
    phone: r.phone ?? undefined,
    children: r.children ? (r.children as any[]).map(toChild) : undefined,
  };
}

export function createFamiliesMethods(sb: AppSupabase) {
  return {
    async getFamily(familyId: string): Promise<Family> {
      const { data, error } = await sb
        .from('families')
        .select('*, children(*)')
        .eq('id', familyId)
        .single();
      if (error) throw toAppError(error);
      return toFamily(data);
    },

    async getAllFamilies(): Promise<Family[]> {
      const { data, error } = await sb.from('families').select('*').order('parent_name');
      if (error) throw toAppError(error);
      return (data ?? []).map(toFamily);
    },

    async getChildren(familyId: string): Promise<Child[]> {
      const { data, error } = await sb
        .from('children')
        .select('*, preferred_teacher:teachers(name)')
        .eq('family_id', familyId)
        .is('archived_at', null)
        .order('created_at');
      if (error) throw toAppError(error);
      return (data ?? []).map(toChild);
    },

    async getAllChildren(): Promise<Child[]> {
      const { data, error } = await sb
        .from('children')
        .select('*, preferred_teacher:teachers(name)')
        .is('archived_at', null)
        .order('family_id');
      if (error) throw toAppError(error);
      return (data ?? []).map(toChild);
    },

    async addChild(familyId: string, child: NewChild): Promise<Child> {
      const { data, error } = await sb
        .from('children')
        .insert({
          family_id: familyId,
          given_name: child.givenName,
          family_name: child.familyName,
          year_level: child.year,
          school: child.school ?? null,
        })
        .select()
        .single();
      if (error) throw toAppError(error);
      return toChild(data);
    },

    async updateChild(childId: string, patch: ChildPatch): Promise<Child> {
      const snakePatch: Record<string, unknown> = {};
      if (patch.givenName !== undefined) snakePatch.given_name = patch.givenName;
      if (patch.familyName !== undefined) snakePatch.family_name = patch.familyName;
      if (patch.preferredName !== undefined) snakePatch.preferred_name = patch.preferredName;
      if (patch.year !== undefined) snakePatch.year_level = patch.year;
      if (patch.school !== undefined) snakePatch.school = patch.school;
      if (patch.concern !== undefined) snakePatch.concern = patch.concern;
      if (patch.subjects !== undefined) snakePatch.subjects = patch.subjects;
      if (patch.preferredDays !== undefined) snakePatch.preferred_days = patch.preferredDays;
      if (patch.goals !== undefined) snakePatch.goals = patch.goals;
      if (patch.notes !== undefined) snakePatch.notes = patch.notes;

      const { data, error } = await sb
        .from('children')
        .update(snakePatch)
        .eq('id', childId)
        .select()
        .single();
      if (error) throw toAppError(error);
      return toChild(data);
    },

    async createFamily(input: { parentName: string; email?: string; phone?: string }): Promise<Family> {
      const raw = await rpc<any>(sb, 'admin_create_family', {
        p_parent_name: input.parentName,
        p_email: input.email ?? null,
        p_phone: input.phone ?? null,
      });
      return toFamily(raw);
    },

    async adminMarkEnrolled(childId: string, note?: string): Promise<Child> {
      const raw = await rpc<any>(sb, 'admin_mark_enrolled', {
        p_child_id: childId,
        p_note: note ?? null,
      });
      return toChild(raw);
    },

    async completeEnrolment(childId: string, input: EnrolmentInput): Promise<Child> {
      const raw = await rpc<any>(sb, 'complete_enrolment', {
        p_child_id: childId,
        p_child: input.child,
        p_parent: input.parent,
        p_referral: input.referral,
        p_signature: input.signature,
        p_agreed_terms: input.agreed_terms,
        p_agreed_privacy: input.agreed_privacy,
        p_agreed_trampoline: input.agreed_trampoline,
      });
      return toChild(raw);
    },
  };
}
