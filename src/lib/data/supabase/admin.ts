import type { AppSupabase } from '../../supabase';
import { toAppError } from '../errors';
import { rpc } from './rpc';
import type { AdminStats, Closure } from '../../../types/admin';
import type { ClassBooking } from '../../../types/booking';
import type { Program } from '../../../types/teacher';

export function createAdminMethods(sb: AppSupabase) {
  return {
    async getAdminStats(): Promise<AdminStats> {
      const raw = await rpc<AdminStats>(sb, 'admin_dashboard_stats');
      return raw;
    },

    async inviteStaff(input: { email: string; fullName: string; role: 'teacher' | 'admin'; subjects?: string[]; color?: string }): Promise<void> {
      const { error } = await sb.functions.invoke('admin-invite-user', { body: input });
      if (error) throw toAppError(error);
    },

    async getWaitingList(): Promise<ClassBooking[]> {
      const { data, error } = await sb
        .from('class_bookings')
        .select('*, child:children(id,name,initials), session:class_sessions(*, class:classes(program:programs(name,color), teacher:teachers(name,color)))')
        .eq('status', 'waiting_list');
      if (error) throw toAppError(error);
      return (data ?? []) as unknown as ClassBooking[];
    },

    async upsertProgram(p: { id?: string; name: string; description?: string; color?: string; is_active?: boolean }): Promise<Program> {
      const row: Record<string, unknown> = { name: p.name };
      if (p.id) row.id = p.id;
      if (p.description !== undefined) row.description = p.description;
      if (p.color !== undefined) row.color = p.color;
      if (p.is_active !== undefined) row.is_active = p.is_active;
      const { data, error } = await sb.from('programs').upsert(row).select().single();
      if (error) throw toAppError(error);
      return data as unknown as Program;
    },

    async getClosures(): Promise<Closure[]> {
      const { data, error } = await sb
        .from('app_settings')
        .select('value')
        .eq('key', 'closures')
        .maybeSingle();
      if (error) throw toAppError(error);
      return (data?.value as Closure[]) ?? [];
    },

    async upsertClosure(c: { id?: string; date: string; label: string }): Promise<Closure> {
      const closure: Closure = { id: c.id ?? crypto.randomUUID(), date: c.date, label: c.label };
      const { data: existing } = await sb.from('app_settings').select('value').eq('key', 'closures').maybeSingle();
      const list: Closure[] = (existing?.value as Closure[]) ?? [];
      const updated = c.id ? list.map(x => x.id === c.id ? closure : x) : [...list, closure];
      const { error } = await sb.from('app_settings').update({ value: updated }).eq('key', 'closures');
      if (error) throw toAppError(error);
      return closure;
    },

    async deleteClosure(id: string): Promise<void> {
      const { data: existing } = await sb.from('app_settings').select('value').eq('key', 'closures').maybeSingle();
      const list: Closure[] = (existing?.value as Closure[]) ?? [];
      const { error } = await sb.from('app_settings').update({ value: list.filter(x => x.id !== id) }).eq('key', 'closures');
      if (error) throw toAppError(error);
    },
  };
}
