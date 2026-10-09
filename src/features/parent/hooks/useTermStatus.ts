import { useQuery } from '@tanstack/react-query';
import { dataClient } from '../../../lib/data/client';
import { getActiveTerm, termWeeksRemaining, isTermExpiringSoon } from '../../../lib/utils/termUtils';
import { qk } from '../../../lib/data/queryKeys';

export function useTermStatus(familyId: string) {
  const { data: terms = [], isLoading: loadingTerms } = useQuery({
    queryKey: qk.terms(familyId),
    queryFn: () => dataClient.getTerms(familyId),
    enabled: !!familyId,
  });

  const { data: gating, isLoading: loadingGating } = useQuery({
    queryKey: ['gating', familyId],
    queryFn: () => dataClient.getGating(familyId),
    enabled: !!familyId,
  });

  const activeTerm = getActiveTerm(terms);
  const weeksRemaining = activeTerm ? termWeeksRemaining(activeTerm) : 0;
  const expiringSoon = activeTerm ? isTermExpiringSoon(activeTerm) : false;

  // Use server gating state when available, fall back to client-side computation
  const gatingState = gating?.state ?? (terms.length === 0 ? 'NO_TERM_EVER' : activeTerm ? 'ACTIVE_TERM' : 'TERM_EXPIRED');

  return {
    gatingState,
    activeTerm,
    terms,
    weeksRemaining,
    expiringSoon,
    isLoading: loadingTerms || loadingGating,
    classesRemaining: gating?.classes_remaining ?? activeTerm?.classes_remaining ?? 0,
  };
}
