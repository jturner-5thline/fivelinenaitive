import { supabase } from "@/integrations/supabase/client";

export interface DealOperationResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Execute a deal operation via the secure edge function.
 * All deal CRUD from the AI assistant goes through here.
 */
export async function executeDealOperation(
  action: string,
  params: Record<string, unknown>
): Promise<DealOperationResult> {
  try {
    const { data, error } = await supabase.functions.invoke("deal-operations", {
      body: { action, params },
    });

    if (error) {
      return { success: false, error: error.message || "Operation failed" };
    }

    return data as DealOperationResult;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// Valid stages and statuses for the AI to reference
export const VALID_DEAL_STAGES = [
  { id: "final-credit-items", label: "Final Credit Items" },
  { id: "client-strategy-review", label: "Client Strategy Review" },
  { id: "write-up-pending", label: "Write-Up Pending" },
  { id: "submitted-to-lenders", label: "Submitted to Lenders" },
  { id: "lenders-in-review", label: "Lenders in Review" },
  { id: "terms-issued", label: "Terms Issued" },
  { id: "in-due-diligence", label: "In Due Diligence" },
  { id: "funded-invoiced", label: "Funded / Invoiced" },
  { id: "closed-won", label: "Closed Won" },
  { id: "closed-lost", label: "Closed Lost" },
  { id: "on-hold", label: "On Hold" },
];

export const VALID_DEAL_STATUSES = [
  { id: "on-track", label: "On Track" },
  { id: "at-risk", label: "At Risk" },
  { id: "off-track", label: "Off Track" },
  { id: "on-hold", label: "On Hold" },
  { id: "archived", label: "Archived" },
];

export const VALID_LENDER_STAGES = [
  { id: "reviewing-drl", label: "Reviewing DRL" },
  { id: "management-call-set", label: "Management Call Set" },
  { id: "management-call-completed", label: "Management Call Completed" },
  { id: "draft-terms", label: "Draft Terms" },
  { id: "term-sheets", label: "Term Sheets" },
];

/**
 * Fuzzy-match a user's stage/status string to a valid ID.
 */
export function matchStageOrStatus(
  input: string,
  options: { id: string; label: string }[]
): { id: string; label: string } | null {
  const lower = input.toLowerCase().trim();

  // Exact match on id or label
  const exact = options.find(
    (o) => o.id === lower || o.label.toLowerCase() === lower
  );
  if (exact) return exact;

  // Partial match
  const partial = options.find(
    (o) =>
      o.id.includes(lower) ||
      o.label.toLowerCase().includes(lower) ||
      lower.includes(o.id) ||
      lower.includes(o.label.toLowerCase())
  );
  if (partial) return partial;

  return null;
}
