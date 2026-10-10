import { useTermStatus } from './useTermStatus';

export interface BookingEligibility {
  gatingState: 'NO_TERM_EVER' | 'ACTIVE_TERM' | 'TERM_EXPIRED';
  canBookAssessment: true;
  canBookIndividualClass: boolean;
  individualClassBlockReason: string | null;
  canPurchaseTerm: true;
  weeksRemaining: number;
  expiringSoon: boolean;
  activeTerm: ReturnType<typeof useTermStatus>['activeTerm'];
  isLoading: boolean;
}

export function useBookingEligibility(familyId: string): BookingEligibility {
  const { gatingState, activeTerm, weeksRemaining, expiringSoon, isLoading } = useTermStatus(familyId);

  const canBookIndividualClass = gatingState === 'ACTIVE_TERM' || gatingState === 'TERM_EXPIRED';
  const individualClassBlockReason: string | null =
    gatingState === 'NO_TERM_EVER'
      ? 'Individual class bookings are available after your first term purchase.'
      : null;

  return {
    gatingState,
    canBookAssessment: true,
    canBookIndividualClass,
    individualClassBlockReason,
    canPurchaseTerm: true,
    weeksRemaining,
    expiringSoon,
    activeTerm,
    isLoading,
  };
}
