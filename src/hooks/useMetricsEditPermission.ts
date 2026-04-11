import { useAuth } from '@/contexts/AuthContext';

/**
 * Authorized emails that can edit shared Metrics dashboard configurations.
 * All other users see the shared config in read-only mode.
 */
const METRICS_EDITOR_EMAILS = new Set([
  'jturner@5thline.co',
  'jmoffitt@5thline.co',
]);

/**
 * Returns whether the current user can edit the shared Metrics dashboard
 * configuration (dashboards, widgets, layouts, folders, formulas, etc.).
 *
 * Only designated editors can save changes; all other company members
 * see the persisted shared config in read-only mode.
 */
export function useMetricsEditPermission() {
  const { user } = useAuth();
  const canEditMetrics = !!user?.email && METRICS_EDITOR_EMAILS.has(user.email);
  return { canEditMetrics, userEmail: user?.email ?? null };
}
