import { supabase } from '@/integrations/supabase/client';
import { findMatchingConfig, type DefaultChecklistConfigV2 } from '@/hooks/useDefaultChecklistConfig';

/**
 * Parse stored checklist config from company_settings.
 */
function parseConfig(raw: unknown): DefaultChecklistConfigV2 {
  if (!raw) return { version: 2, configs: [] };
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(raw)) return { version: 2, configs: [] };
  if (obj.version === 2) return obj as unknown as DefaultChecklistConfigV2;
  if (!obj.version && Object.keys(obj).length === 0) return { version: 2, configs: [] };
  return { version: 2, configs: [] };
}

/** Normalize text for comparison: lowercase, collapse whitespace, trim */
function normalizeText(t: unknown): string {
  return String(t ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Normalize for round/key matching: lowercase + strip ALL spaces */
function normalizeKey(t: unknown): string {
  return String(t ?? '').toLowerCase().replace(/\s+/g, '');
}

/** Generate a stable item key from its label for dedup */
function itemKey(label: unknown): string {
  return String(label ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

interface AutoPopulateResult {
  inserted: number;
  skippedDuplicates: number;
  matchedDealType: string | null;
  matchedRound: string | null;
  sourceItemCount: number;
  reasons: string[];
}

/**
 * Automatically creates Outstanding Items for a deal from the matched
 * Deal-Type Checklist Defaults for the specified round.
 *
 * - Sets requester to "5th Line".
 * - Idempotent: skips items that already exist via source_metadata or description match.
 *
 * @returns AutoPopulateResult with full diagnostics
 */
export async function autoPopulateOutstandingItems(
  dealId: string,
  dealTypes: string[],
  companyId: string,
  userId: string,
  roundName: string = 'initial items',
): Promise<AutoPopulateResult> {
  const result: AutoPopulateResult = {
    inserted: 0,
    skippedDuplicates: 0,
    matchedDealType: null,
    matchedRound: null,
    sourceItemCount: 0,
    reasons: [],
  };

  const logPrefix = `[AutoPopulate] deal=${dealId} round="${roundName}"`;

  try {
    // 1. Fetch config
    const { data: settings, error: settingsError } = await supabase
      .from('company_settings')
      .select('data_room_default_checklists')
      .eq('company_id', companyId)
      .maybeSingle();

    if (settingsError) {
      result.reasons.push(`Settings fetch error: ${settingsError.message}`);
      console.error(logPrefix, 'Settings error:', settingsError);
      return result;
    }

    if (!settings?.data_room_default_checklists) {
      result.reasons.push('No data_room_default_checklists found in company_settings');
      console.warn(logPrefix, 'No config found');
      return result;
    }

    const parsed = parseConfig(settings.data_room_default_checklists);
    if (!parsed.configs.length) {
      result.reasons.push('Parsed config has 0 deal type configs');
      console.warn(logPrefix, 'Empty config');
      return result;
    }

    // 2. Find matching config — normalize deal types before matching
    let matchedConfig = null;
    let matchedDealTypeText = '';
    for (const dt of dealTypes) {
      const normalized = normalizeText(dt);
      matchedConfig = findMatchingConfig(parsed.configs, normalized);
      if (matchedConfig) {
        matchedDealTypeText = dt;
        break;
      }
    }

    if (!matchedConfig) {
      result.reasons.push(`No config matched for deal types: ${dealTypes.join(', ')}`);
      console.warn(logPrefix, 'No matching config for', dealTypes);
      return result;
    }

    result.matchedDealType = matchedConfig.dealTypeMatchString;
    console.log(logPrefix, `Matched config: "${matchedConfig.dealTypeMatchString}" from deal type "${matchedDealTypeText}"`);

    // 3. Find the requested round with normalized matching
    const normalizedTarget = normalizeKey(roundName);
    const matchedRound = matchedConfig.rounds.find(
      (r) => normalizeKey(r.title) === normalizedTarget,
    );

    if (!matchedRound) {
      result.reasons.push(`No round matched for "${roundName}" (normalized: "${normalizedTarget}"). Available rounds: ${matchedConfig.rounds.map(r => r.title).join(', ')}`);
      console.warn(logPrefix, 'No matching round');
      return result;
    }

    if (!matchedRound.items.length) {
      result.reasons.push(`Matched round "${matchedRound.title}" has 0 items`);
      console.warn(logPrefix, 'Round has no items');
      return result;
    }

    result.matchedRound = matchedRound.title;
    result.sourceItemCount = matchedRound.items.length;
    console.log(logPrefix, `Matched round: "${matchedRound.title}" with ${matchedRound.items.length} items`);

    // 4. Fetch existing outstanding items for dedup (both description and source_metadata)
    const { data: existingItems, error: fetchError } = await supabase
      .from('outstanding_items')
      .select('description, source_metadata')
      .eq('deal_id', dealId);

    if (fetchError) {
      result.reasons.push(`Fetch existing items error: ${fetchError.message}`);
      console.error(logPrefix, 'Fetch error:', fetchError);
      return result;
    }

    // Build dedup sets: by source_metadata key and by description
    const existingBySourceKey = new Set<string>();
    const existingByDescription = new Set<string>();

    for (const item of existingItems || []) {
      existingByDescription.add(normalizeText(item.description));

      const meta = item.source_metadata as Record<string, unknown> | null;
      if (meta?.source_item_key && meta?.source_round) {
        existingBySourceKey.add(`${normalizeKey(meta.source_round as string)}::${meta.source_item_key}`);
      }
    }

    // 5. Build insert list
    const status = JSON.stringify({
      received: false,
      approved: false,
      deliveredToLenders: [],
      requestedBy: ['5th Line'],
    });

    // Get max position
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

    const sourceRoundNormalized = normalizeKey(matchedRound.title);
    const inserts: {
      deal_id: string;
      description: string;
      status: string;
      user_id: string;
      priority: string;
      position: number;
      notes: string;
      source_metadata: Record<string, string>;
    }[] = [];
    let skipped = 0;

    for (const item of [...matchedRound.items].sort((a, b) => a.order - b.order)) {
      const key = itemKey(item.label);
      const sourceKey = `${sourceRoundNormalized}::${key}`;

      // Check duplicates by source metadata key first, then by description
      if (existingBySourceKey.has(sourceKey)) {
        skipped++;
        continue;
      }
      if (existingByDescription.has(normalizeText(item.label))) {
        skipped++;
        continue;
      }

      inserts.push({
        deal_id: dealId,
        description: item.label,
        status,
        user_id: userId,
        priority: 'normal',
        position: nextPosition + inserts.length,
        notes: `Auto-created from Deal-Type Checklist Defaults — ${matchedRound.title}`,
        source_metadata: {
          source_type: 'deal_type_checklist_default',
          source_round: matchedRound.title,
          source_deal_type_match: matchedConfig.dealTypeMatchString,
          source_item_key: key,
        },
      });
    }

    result.skippedDuplicates = skipped;

    if (!inserts.length) {
      result.reasons.push(`All ${matchedRound.items.length} items already exist (${skipped} duplicates skipped)`);
      console.log(logPrefix, 'All items already exist, nothing to insert');
      return result;
    }

    const { error: insertError } = await supabase
      .from('outstanding_items')
      .insert(inserts);

    if (insertError) {
      result.reasons.push(`Insert error: ${insertError.message}`);
      console.error(logPrefix, 'Insert error:', insertError);
      return result;
    }

    result.inserted = inserts.length;
    console.log(logPrefix, `Inserted ${inserts.length} items, skipped ${skipped} duplicates. Matched: "${matchedConfig.dealTypeMatchString}" / "${matchedRound.title}"`);
    return result;
  } catch (err) {
    result.reasons.push(`Unexpected error: ${err}`);
    console.error(logPrefix, 'Unexpected error:', err);
    return result;
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

/** Canonical stage slugs for Final Credit Items */
const FINAL_CREDIT_ITEMS_SLUGS = new Set([
  'final-credit-items',
  'final credit items',
]);

/** Check if a stage value represents "Final Credit Items" */
export function isFinalCreditItemsStage(stage: string | null | undefined): boolean {
  if (!stage) return false;
  return FINAL_CREDIT_ITEMS_SLUGS.has(stage.toLowerCase().trim());
}

/** Canonical stage slugs for NDA/Needs List Sent */
const NDA_NEEDS_LIST_SENT_SLUGS = new Set([
  'ndaneeds-list-sent',
  'nda-needs-list-sent',
  'nda_needs_list_sent',
  'nda/needs list sent',
  'nda needs list sent',
]);

/** Check if a stage value represents "NDA/Needs List Sent" */
export function isNdaNeedsListSentStage(stage: string | null | undefined): boolean {
  if (!stage) return false;
  return NDA_NEEDS_LIST_SENT_SLUGS.has(stage.toLowerCase().trim());
}
