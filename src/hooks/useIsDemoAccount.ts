import { useCompany } from '@/hooks/useCompany';
import { isDemoCompanyId } from '@/lib/demoAccount';

/**
 * Returns true when the current user belongs to the demo tenant
 * (the company that owns demo@5thline.co). Use this to gate
 * demo-only UI overrides without affecting any other workspace.
 */
export function useIsDemoAccount(): boolean {
  const { company } = useCompany();
  return isDemoCompanyId(company?.id);
}