/**
 * useAssistEnabled
 * ----------------
 * Single source of truth for "is the AI Assist email feature available
 * for the current user?". Resolves the precedence required by the Assist
 * feature governance spec:
 *
 *   1. Company-level override (company_features.assist_enabled, true/false)
 *   2. Tenant default rule:
 *        - 5thline.co accounts => ON
 *        - everyone else       => OFF
 *
 * Returns a single boolean. UI surfaces should hide all Assist entry
 * points when this is false (no dead/disabled affordances).
 */
import { useCompanyFeatures } from './useCompanyFeatures';

export function useAssistEnabled(): boolean {
  const { features } = useCompanyFeatures();
  return Boolean(features?.assist_enabled);
}
