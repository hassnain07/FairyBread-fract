import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './data/supabase/database.types';

export type AppSupabase = SupabaseClient<Database>;

export function createAppSupabase(
  url: string,
  anonKey: string,
  opts?: {
    storage?: unknown;            // RN: AsyncStorage
    detectSessionInUrl?: boolean; // web: true, RN: false
  }
): AppSupabase {
  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: opts?.detectSessionInUrl ?? true,
      ...(opts?.storage ? { storage: opts.storage as never } : {}),
    },
  });
}

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');

export const supabase = createAppSupabase(url, key);
