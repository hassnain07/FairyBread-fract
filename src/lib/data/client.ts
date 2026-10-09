import { supabase } from '../supabase';
import { createSupabaseDataClient } from './supabase';
import type { DataClient } from './types';

export const dataClient = createSupabaseDataClient(supabase) as DataClient;
