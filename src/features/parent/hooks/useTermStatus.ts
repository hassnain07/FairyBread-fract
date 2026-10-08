import { useQuery } from '@tanstack/react-query';
import { dataClient } from '../../../lib/data/client';
import { computeGatingState, getActiveTerm, termWeeksRemaining, isTermExpiringSoon } from '../../../lib/utils/termUtils';

export function useTermStatus(familyId: string) {
  const { data: terms = [], isLoading } = useQuery({
    queryKey: ['terms', familyId],
    queryFn: () => dataClient.getTerms(familyId),
  });

  const gatingState = computeGatingState(terms);
  const activeTerm = getActiveTerm(terms);
  const weeksRemaining = activeTerm ? termWeeksRemaining(activeTerm) : 0;
  const expiringSoon = activeTerm ? isTermExpiringSoon(activeTerm) : false;

  return { gatingState, activeTerm, terms, weeksRemaining, expiringSoon, isLoading };
}
