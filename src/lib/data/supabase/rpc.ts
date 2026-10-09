import type { AppSupabase } from '../../supabase';
import { toAppError } from '../errors';

export async function rpc<T>(
  sb: AppSupabase,
  fn: string,
  args?: Record<string, unknown>
): Promise<T> {
  const { data, error } = await sb.rpc(fn as never, args as never);
  if (error) throw toAppError(error);
  return data as T;
}
