import type { AppSupabase } from '../../supabase';
import { toAppError } from '../errors';
import type { Teacher, Program, ClassSlot, ClassSession, ClassSlotInput } from '../../../types/teacher';

function toTeacher(r: any): Teacher {
  return {
    id: r.id,
    name: r.name,
    initials: r.initials ?? r.name.split(' ').map((p: string) => p[0]).join('').toUpperCase(),
    subjects: r.subjects ?? [],
    color: r.color ?? 'pink',
  };
}

function toProgram(r: any): Program {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    color: r.color ?? undefined,
    is_active: r.is_active ?? true,
  };
}

function toClassSlot(r: any): ClassSlot {
  return {
    id: r.id,
    subject: r.subject ?? r.program_name ?? '',
    program_id: r.program_id,
    teacher_id: r.teacher_id,
    teacher_name: r.teacher_name ?? '',
    teacher_color: r.teacher_color ?? 'pink',
    day_of_week: r.day_of_week,
    start_time: r.start_time,
    duration_minutes: r.duration_minutes ?? 60,
    capacity: r.capacity,
    is_active: r.is_active ?? true,
    next_session_id: r.next_session_id ?? undefined,
    next_session_at: r.next_session_at ?? undefined,
    next_booked_count: r.next_booked_count ?? 0,
    price_cents: r.price_cents ?? undefined,
  };
}

export function toClassSession(r: any): ClassSession {
  const booked = r.booked_count ?? 0;
  const capacity = r.capacity ?? 0;
  return {
    id: r.id,
    class_id: r.class_id,
    starts_at: r.starts_at,
    ends_at: r.ends_at ?? r.starts_at,
    capacity,
    booked_count: booked,
    status: r.status ?? 'scheduled',
    spaces_left: Math.max(0, capacity - booked),
    subject: r.class?.program?.name ?? r.subject ?? '',
    teacher_id: r.class?.teacher_id ?? r.teacher_id ?? '',
    teacher_name: r.class?.teacher?.name ?? r.teacher_name ?? '',
    teacher_color: r.class?.teacher?.color ?? r.teacher_color ?? 'pink',
    program_color: r.class?.program?.color ?? r.program_color ?? 'pink',
  };
}

export function createCatalogMethods(sb: AppSupabase) {
  return {
    async getTeachers(): Promise<Teacher[]> {
      const { data, error } = await sb
        .from('teachers')
        .select('id,name,initials,subjects,color')
        .eq('is_active', true);
      if (error) throw toAppError(error);
      return (data ?? []).map(toTeacher);
    },

    async getPrograms(): Promise<Program[]> {
      const { data, error } = await sb.from('programs').select('*').order('name');
      if (error) throw toAppError(error);
      return (data ?? []).map(toProgram);
    },

    async getClassSlots(): Promise<ClassSlot[]> {
      const { data, error } = await sb
        .from('v_class_catalog')
        .select('*')
        .eq('is_active', true);
      if (error) throw toAppError(error);
      return (data ?? []).map(toClassSlot);
    },

    async getUpcomingSessions(opts?: { from?: string; to?: string; classId?: string; teacherId?: string }): Promise<ClassSession[]> {
      const now = new Date().toISOString();
      let q = sb
        .from('class_sessions')
        .select('*, class:classes(teacher_id, program:programs(name,color), teacher:teachers(name,color))')
        .eq('status', 'scheduled')
        .gte('starts_at', opts?.from ?? now)
        .order('starts_at');
      if (opts?.to) q = q.lt('starts_at', opts.to);
      if (opts?.classId) q = q.eq('class_id', opts.classId);
      if (opts?.teacherId) q = q.eq('class.teacher_id', opts.teacherId);
      const { data, error } = await q;
      if (error) throw toAppError(error);
      return (data ?? []).map(toClassSession);
    },

    async createClassSlot(input: ClassSlotInput): Promise<ClassSlot> {
      const { data: cls, error: clsErr } = await sb
        .from('classes')
        .insert({
          program_id: input.program_id,
          teacher_id: input.teacher_id,
          day_of_week: input.day_of_week,
          start_time: input.start_time,
          duration_minutes: input.duration_minutes ?? 60,
          capacity: input.capacity,
        })
        .select('id')
        .single();
      if (clsErr) throw toAppError(clsErr);
      if (input.price_cents !== undefined) {
        const { error: rateErr } = await sb
          .from('class_rates')
          .upsert({ class_id: cls.id, price_cents: input.price_cents });
        if (rateErr) throw toAppError(rateErr);
      }
      const { data, error } = await sb.from('v_class_catalog').select('*').eq('id', cls.id).single();
      if (error) throw toAppError(error);
      return toClassSlot(data);
    },

    async updateClassSlot(id: string, patch: Partial<ClassSlotInput>): Promise<ClassSlot> {
      const update: Record<string, unknown> = {};
      if (patch.program_id !== undefined) update.program_id = patch.program_id;
      if (patch.teacher_id !== undefined) update.teacher_id = patch.teacher_id;
      if (patch.day_of_week !== undefined) update.day_of_week = patch.day_of_week;
      if (patch.start_time !== undefined) update.start_time = patch.start_time;
      if (patch.duration_minutes !== undefined) update.duration_minutes = patch.duration_minutes;
      if (patch.capacity !== undefined) update.capacity = patch.capacity;
      if (Object.keys(update).length > 0) {
        const { error } = await sb.from('classes').update(update).eq('id', id);
        if (error) throw toAppError(error);
      }
      if (patch.price_cents !== undefined) {
        const { error } = await sb.from('class_rates').upsert({ class_id: id, price_cents: patch.price_cents });
        if (error) throw toAppError(error);
      }
      const { data, error } = await sb.from('v_class_catalog').select('*').eq('id', id).single();
      if (error) throw toAppError(error);
      return toClassSlot(data);
    },

    async deactivateClassSlot(id: string, cancelFuture?: boolean): Promise<number> {
      const { data, error } = await sb.rpc('deactivate_class', { p_class_id: id, p_cancel_future: cancelFuture ?? false });
      if (error) throw toAppError(error);
      return data as number;
    },

    async cancelSession(sessionId: string, reason?: string): Promise<number> {
      const { data, error } = await sb.rpc('cancel_session', { p_session_id: sessionId, p_reason: reason ?? null });
      if (error) throw toAppError(error);
      return data as number;
    },
  };
}
