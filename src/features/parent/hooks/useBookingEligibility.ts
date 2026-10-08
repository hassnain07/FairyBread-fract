import { useTermStatus } from './useTermStatus';

export interface BookingEligibility {
  gatingState: 'NO_TERM_EVER' | 'ACTIVE_TERM' | 'TERM_EXPIRED';
  canBookAssessment: true;
  canBookRegularClass: boolean;
  regularClassBlockReason: string | null;
  canBookIndividualClass: boolean;
  individualClassBlockReason: string | null;
  canPurchaseTerm: true;
  classesRemaining: number;
  weeksRemaining: number;
  expiringSoon: boolean;
  activeTerm: ReturnType<typeof useTermStatus>['activeTerm'];
  isLoading: boolean;
}

export function useBookingEligibility(familyId: string): BookingEligibility {
  const { gatingState, activeTerm, weeksRemaining, expiringSoon, isLoading } = useTermStatus(familyId);

  const classesRemaining = activeTerm?.classes_remaining ?? 0;

  // Regular class: ACTIVE_TERM + credits > 0
  const canBookRegularClass = gatingState === 'ACTIVE_TERM' && classesRemaining > 0;
  const regularClassBlockReason: string | null =
    gatingState === 'NO_TERM_EVER'
      ? 'Purchase a term to unlock regular class bookings.'
      : gatingState === 'TERM_EXPIRED'
      ? 'Your term has ended. Renew your term to book regular classes again.'
      : classesRemaining === 0
      ? 'You have used all 10 credits for this term. Book an individual class or renew your term.'
      : null;

  // Individual class: allowed once family has any term history (any status)
  const canBookIndividualClass = gatingState === 'ACTIVE_TERM' || gatingState === 'TERM_EXPIRED';
  const individualClassBlockReason: string | null =
    gatingState === 'NO_TERM_EVER'
      ? 'Individual class bookings are available after your first term purchase.'
      : null;

  return {
    gatingState,
    canBookAssessment: true,
    canBookRegularClass,
    regularClassBlockReason,
    canBookIndividualClass,
    individualClassBlockReason,
    canPurchaseTerm: true,
    classesRemaining,
    weeksRemaining,
    expiringSoon,
    activeTerm,
    isLoading,
  };
}
