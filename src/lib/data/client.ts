import { supabase } from '../supabase';
import { mockDataClient } from './mock/client';
import { createSupabaseDataClient } from './supabase';
import type { DataClient } from './types';

// TEMP-LEGACY: Supabase methods are added phase by phase.
// Each phase moves methods from mockDataClient into createSupabaseDataClient and removes the mock passthrough.
// Phase 12 removes this composite entirely: export const dataClient = createSupabaseDataClient(supabase);
export const dataClient = {
  ...mockDataClient,
  ...createSupabaseDataClient(supabase),
} as DataClient;
