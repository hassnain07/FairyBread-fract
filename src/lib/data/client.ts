import { mockDataClient } from './mock/client';
import { supabaseDataClient } from './supabase/client';

// Switch data source via VITE_DATA_SOURCE=mock|supabase
const source = import.meta.env.VITE_DATA_SOURCE ?? 'mock';

export const dataClient = source === 'supabase' ? supabaseDataClient : mockDataClient;
