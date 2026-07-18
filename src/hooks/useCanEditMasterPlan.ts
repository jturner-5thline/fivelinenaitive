import { useAuth } from '@/contexts/AuthContext';

const MASTER_PLAN_EMAILS = new Set([
  'jturner@5thline.co',
  'jmoffitt@5thline.co',
  'ffustinoni@5thline.co',
]);

/**
 * Restricts visibility of the Master Plan button and per-dashboard
 * plan-edit gear icons to an explicit 5th Line allowlist.
 */
export function useCanEditMasterPlan() {
  const { user } = useAuth();
  const canEditMasterPlan = !!user?.email && MASTER_PLAN_EMAILS.has(user.email.toLowerCase());
  return { canEditMasterPlan };
}