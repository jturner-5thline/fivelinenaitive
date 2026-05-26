/**
 * Pure helper that mirrors the payload-building logic in the copilot-chat
 * edge function's `update_deal_fields` handler. Kept here so the same rules
 * are unit-testable from vitest without spinning up Deno.
 *
 * IMPORTANT: When you change semantics here, update the matching block in
 * supabase/functions/copilot-chat/index.ts (search for "update_deal_fields execute").
 */

export interface DealFieldsArgs {
  value?: number;
  closing_date?: string | null;
  is_flagged?: boolean;
  flag_notes?: string | null;
  stage?: string;
  manager?: string;
  deal_owner?: string;
  narrative?: string;
  deal_type?: string;
  engagement_type?: string;
  pre_signing_hours?: number;
  pre_signing_hours_delta?: number;
  post_signing_hours?: number;
  post_signing_hours_delta?: number;
}

export interface DealHoursSnapshot {
  pre_signing_hours: number;
  post_signing_hours: number;
}

export interface DealFieldsUpdate {
  value?: number;
  closing_date?: string | null;
  is_flagged?: boolean;
  flag_notes?: string | null;
  stage?: string;
  manager?: string;
  deal_owner?: string;
  narrative?: string;
  deal_type?: string;
  engagement_type?: string;
  pre_signing_hours?: number;
  post_signing_hours?: number;
}

/**
 * Build the concrete column-update payload for a deal-fields write.
 *
 * Hours rules:
 * - If the absolute `*_hours` is provided, it wins (sets the value).
 * - Otherwise, if `*_hours_delta` is provided, the helper adds it to the
 *   snapshot's current value (delta can be negative).
 */
export function buildDealFieldsUpdate(
  args: DealFieldsArgs,
  current: DealHoursSnapshot,
): DealFieldsUpdate {
  const out: DealFieldsUpdate = {};
  if (args.value !== undefined) out.value = args.value;
  if (args.closing_date !== undefined) out.closing_date = args.closing_date || null;
  if (args.is_flagged !== undefined) {
    out.is_flagged = args.is_flagged;
    if (args.flag_notes !== undefined) out.flag_notes = args.flag_notes;
  }
  if (args.stage !== undefined) out.stage = args.stage;
  if (args.manager !== undefined) out.manager = args.manager;
  if (args.deal_owner !== undefined) out.deal_owner = args.deal_owner;
  if (args.narrative !== undefined) out.narrative = args.narrative;
  if (args.deal_type !== undefined) out.deal_type = args.deal_type;
  if (args.engagement_type !== undefined) out.engagement_type = args.engagement_type;

  if (args.pre_signing_hours !== undefined && args.pre_signing_hours !== null) {
    out.pre_signing_hours = Number(args.pre_signing_hours);
  } else if (args.pre_signing_hours_delta !== undefined && args.pre_signing_hours_delta !== null) {
    out.pre_signing_hours = Number(current.pre_signing_hours || 0) + Number(args.pre_signing_hours_delta);
  }

  if (args.post_signing_hours !== undefined && args.post_signing_hours !== null) {
    out.post_signing_hours = Number(args.post_signing_hours);
  } else if (args.post_signing_hours_delta !== undefined && args.post_signing_hours_delta !== null) {
    out.post_signing_hours = Number(current.post_signing_hours || 0) + Number(args.post_signing_hours_delta);
  }

  return out;
}

export function isEmptyDealFieldsPayload(p: DealFieldsUpdate): boolean {
  return Object.keys(p).length === 0;
}