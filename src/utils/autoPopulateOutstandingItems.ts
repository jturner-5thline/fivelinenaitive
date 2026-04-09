import { supabase } from '@/integrations/supabase/client';
import { findMatchingConfig, type DefaultChecklistConfigV2 } from '@/hooks/useDefaultChecklistConfig';

/**
 * Parse stored checklist config from company_settings.
 * Duplicated parse logic to avoid circular deps with the hook file's internal parser.
 */
function parseConfig(raw: unknown): DefaultChecklistConfigV2 {
  if (!raw) return { version: 2, configs: [] };
  const obj = raw as Record<string, unknown>;
  if (obj.version === 2) return obj as unknown as DefaultChecklistConfigV2;
  // Empty object {} or unrecognized format — treat as no config
  if (!obj.version && Object.keys(obj).length === 0) return { version: 2, configs: [] };
  // Legacy format — attempt migration not supported here; return empty
  return { version: 2, configs: [] };
}

/**
 * Automatically creates Outstanding Items for a deal from the matched
 * Deal-Type Checklist Defaults → "Initial Items" round.
 *
 * - Only creates items from the "Initial Items" round.
 * - Sets requester to "5th Line".
 * - Idempotent: skips items whose description already exists for the deal
 *   (case-insensitive match).
 *
 * @returns number of items inserted
 */
export async function autoPopulateOutstandingItems(
  dealId: string,
  dealTypes: string[],
  companyId: string,
  userId: string,
  roundName: string = 'initial items',
): Promise<number> {
  try {
    // 1. Fetch the deal-type checklist config from company_settings
    const { data: settings, error: settingsError } = await supabase
      .from('company_settings')
      .select('data_room_default_checklists')
      .eq('company_id', companyId)
      .maybeSingle();

    if (settingsError) throw settingsError;
    const parsed = parseConfig(settings?.data_room_default_checklists);
    if (!parsed.configs.length) return 0;

    // 2. Find first matching config across deal types (first match wins)
    let matchedConfig = null;
    for (const dt of dealTypes) {
      matchedConfig = findMatchingConfig(parsed.configs, dt);
      if (matchedConfig) break;
    }
    if (!matchedConfig) return 0;

    // 3. Find the requested round with normalized matching
    const normalizeRoundTitle = (t: string) => t.toLowerCase().replace(/\s+/g, '');
    const normalizedTarget = normalizeRoundTitle(roundName);
    const matchedRound = matchedConfig.rounds.find(
      (r) => normalizeRoundTitle(r.title) === normalizedTarget,
    );
    if (!matchedRound || !matchedRound.items.length) return 0;

    // 4. Fetch existing outstanding items for dedup
    const { data: existingItems, error: fetchError } = await supabase
      .from('outstanding_items')
      .select('description')
      .eq('deal_id', dealId);

    if (fetchError) throw fetchError;

    const existingNames = new Set(
      (existingItems || []).map((i) => i.description.trim().toLowerCase()),
    );

    // 5. Build insert list, deduplicating
    const status = JSON.stringify({
      received: false,
      approved: false,
      deliveredToLenders: [],
      requestedBy: ['5th Line'],
    });

    // Get max position of existing items
    let nextPosition = 0;
    if (existingItems && existingItems.length > 0) {
      const { data: posData } = await supabase
        .from('outstanding_items')
        .select('position')
        .eq('deal_id', dealId)
        .order('position', { ascending: false })
        .limit(1)
        .single();
      nextPosition = (posData?.position ?? -1) + 1;
    }

    const sourceLabel = matchedRound.title;
    const inserts = matchedRound.items
      .sort((a, b) => a.order - b.order)
      .filter((item) => !existingNames.has(item.label.trim().toLowerCase()))
      .map((item, idx) => ({
        deal_id: dealId,
        description: item.label,
        status,
        user_id: userId,
        priority: 'normal',
        position: nextPosition + idx,
        notes: `Auto-created from Deal-Type Checklist Defaults — ${sourceLabel}`,
      }));

    if (!inserts.length) return 0;

    const { error: insertError } = await supabase
      .from('outstanding_items')
      .insert(inserts);

    if (insertError) throw insertError;
    return inserts.length;
  } catch (err) {
    console.error('Error auto-populating outstanding items:', err);
    return 0;
  }
}

/**
 * Check if the given pipeline_id is the Active (default) pipeline for a company.
 */
export async function isActivePipeline(
  pipelineId: string | null | undefined,
  companyId: string,
): Promise<boolean> {
  if (!pipelineId) {
    // Deals without a pipeline_id are considered Active Pipeline deals
    return true;
  }
  const { data } = await supabase
    .from('deal_pipelines')
    .select('is_default')
    .eq('id', pipelineId)
    .eq('company_id', companyId)
    .maybeSingle();

  return data?.is_default === true;
}
