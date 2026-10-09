import type { AppSupabase } from '../../supabase';
import type { DataClient } from '../types';
import { createAuthMethods } from './auth';
import { createSettingsMethods } from './settings';
import { createFamiliesMethods } from './families';
import { createTermsMethods } from './terms';
import { createCatalogMethods } from './catalog';
import { createBookingsMethods } from './bookings';
import { createPaymentsMethods } from './payments';
import { createAssessmentsMethods } from './assessments';
import { createReportsMethods } from './reports';
import { createAttendanceMethods } from './attendance';
import { createAdminMethods } from './admin';

export function createSupabaseDataClient(sb: AppSupabase): Partial<DataClient> {
  return {
    ...createAuthMethods(sb),
    ...createSettingsMethods(sb),
    ...createFamiliesMethods(sb),
    ...createTermsMethods(sb),
    ...createCatalogMethods(sb),
    ...createBookingsMethods(sb),
    ...createPaymentsMethods(sb),
    ...createAssessmentsMethods(sb),
    ...createReportsMethods(sb),
    ...createAttendanceMethods(sb),
    ...createAdminMethods(sb),
  };
}
