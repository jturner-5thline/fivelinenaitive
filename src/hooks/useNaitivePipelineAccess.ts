import { useCompany } from '@/hooks/useCompany';

// Canonical 5th Line company ID — the only tenant that can access the naitive Pipeline page
const FIFTH_LINE_COMPANY_ID = '44556c46-9127-4b12-b14e-d6fee784afcf';

/**
 * Returns whether the current authenticated user belongs to the 5th Line company
 * and should therefore have access to the naitive Pipeline page.
 * Uses company membership (not email domain) as the source of truth.
 */
export function useNaitivePipelineAccess() {
  const { company, isLoading } = useCompany();
  const hasAccess = company?.id === FIFTH_LINE_COMPANY_ID;
  return { hasAccess, isLoading };
}

export { FIFTH_LINE_COMPANY_ID };
