import type { AppSupabase } from '../../supabase';
import type { DataClient } from '../types';
import { createAuthMethods } from './auth';

export function createSupabaseDataClient(sb: AppSupabase): Partial<DataClient> {
  return {
    ...createAuthMethods(sb),
    // Phase 5+: domain methods added here one phase at a time
  };
}
