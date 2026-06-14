// deno-lint-ignore-file no-explicit-any
/**
 * Company-level agent entitlement helper.
 *
 * Centralizes the read against `company_agent_access` so every server-side
 * entry point (chat tools, proactive sweeps, future agent runners) uses
 * the same gate. The master "is this agent turned on for this company?"
 * check sits ABOVE per-user activation. Both must be true for an agent
 * to run for a (company, user) pair.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export const AGENT_KEYS = {
  ADMIN_AGENT: "admin_agent",
} as const;

export type AgentKey = (typeof AGENT_KEYS)[keyof typeof AGENT_KEYS];

export async function isAgentEnabledForCompany(
  supabase: SupabaseClient,
  companyId: string | null | undefined,
  agentKey: string,
): Promise<boolean> {
  if (!companyId || !agentKey) return false;
  try {
    const { data, error } = await supabase.rpc("is_agent_enabled_for_company", {
      p_company_id: companyId,
      p_agent_key: agentKey,
    });
    if (error) {
      console.warn("[agentEntitlement] rpc failed:", error.message);
      return false;
    }
    return data === true;
  } catch (e) {
    console.warn("[agentEntitlement] rpc threw:", (e as Error)?.message);
    return false;
  }
}

export const AGENT_NOT_ENABLED_FOR_COMPANY_MESSAGE =
  'This agent is not enabled for your company. A platform admin must turn it on in Admin → Agent Access.';
