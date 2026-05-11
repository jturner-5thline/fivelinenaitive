import { supabase } from '@/integrations/supabase/client';
import {
  autoPopulateOutstandingItems,
} from '@/utils/autoPopulateOutstandingItems';
import { findMatchingConfig, type DefaultChecklistConfigV2 } from '@/hooks/useDefaultChecklistConfig';

/**
 * Single entry point for populating Outstanding Items from the configured
 * checklists at deal creation OR from the "Apply Checklist" empty-state
 * banner on existing deals.
 *
 * Resolution order:
 *   1. Deal-Type Checklist Defaults (Initial Items round) — if any of the
 *      deal's selected types match a configured deal-type config.
 *   2. Standard Checklist (`data_room_checklist_items`) — fallback.
 *
 * Idempotent: skips items already present on the deal (deduped by
 * description and by `source_metadata.source_item_key`).
 */

export type ChecklistSource = 'deal_type' | 'standard' | 'none';

export interface ApplyChecklistResult {
  inserted: number;
  source: ChecklistSource;
  sourceLabel: string;
}

function parseConfig(raw: unknown): DefaultChecklistConfigV2 {
  if (!raw) return { version: 2, configs: [] };
  const obj = raw as Record<string, unknown>;
  if (obj.version === 2) return obj as unknown as DefaultChecklistConfigV2;
  return { version: 2, configs: [] };
}

function normalizeText(t: string): string {
  return t.toLowerCase().replace(/\s+/g, ' ').trim();
}

function itemKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

export interface ChecklistPreview {
  source: ChecklistSource;
  sourceLabel: string;
  items: Array<{ label: string; category: string | null; required: boolean }>;
}

/**
 * Build a preview of which checklist will be applied for a (companyId, dealTypes)
 * combination — used by the Create Deal modal footer.
 */
export async function getChecklistPreview(
  companyId: string,
  dealTypes: string[],
): Promise<ChecklistPreview> {
  // 1. Try deal-type configs
  const { data: settings } = await supabase
    .from('company_settings')
    .select('data_room_default_checklists')
    .eq('company_id', companyId)
    .maybeSingle();

  const parsed = parseConfig(settings?.data_room_default_checklists);
  for (const dt of dealTypes) {
    const matched = findMatchingConfig(parsed.configs, normalizeText(dt));
    if (matched) {
      // Use the first round (Initial Items) for the preview, mirroring
      // autoPopulateOutstandingItems' default round.
      const round = matched.rounds.find(
        (r) => r.title.toLowerCase().replace(/\s+/g, '') === 'initialitems',
      ) ?? matched.rounds[0];
      if (round && round.items.length > 0) {
        return {
          source: 'deal_type',
          sourceLabel: `${matched.dealTypeMatchString} Checklist`,
          items: [...round.items]
            .sort((a, b) => a.order - b.order)
            .map((i) => ({ label: i.label, category: round.title, required: i.required })),
        };
      }
    }
  }

  // 2. Standard Checklist
  const { data: stdItems } = await supabase
    .from('data_room_checklist_items')
    .select('name, category, is_required, position')
    .eq('company_id', companyId)
    .order('position', { ascending: true });

  if (stdItems && stdItems.length > 0) {
    return {
      source: 'standard',
      sourceLabel: 'Standard Checklist',
      items: stdItems.map((i: any) => ({
        label: i.name,
        category: i.category,
        required: !!i.is_required,
      })),
    };
  }

  return { source: 'none', sourceLabel: '', items: [] };
}

/**
 * Apply the resolved checklist to a deal's outstanding_items table.
 * Idempotent and safe to call from create-deal flow OR from the manual
 * "Apply Checklist" banner on existing deals.
 */
export async function applyDefaultChecklistToOutstandingItems(
  dealId: string,
  dealTypes: string[],
  companyId: string,
  userId: string,
): Promise<ApplyChecklistResult> {
  // 1. Deal-Type config first — reuses existing logic for parity with
  //    the Active Pipeline auto-population.
  for (const dt of dealTypes) {
    const r = await autoPopulateOutstandingItems(dealId, [dt], companyId, userId, 'initial items');
    if (r.matchedDealType && r.sourceItemCount > 0) {
      return {
        inserted: r.inserted,
        source: 'deal_type',
        sourceLabel: `${r.matchedDealType} Checklist`,
      };
    }
  }

  // 2. Standard Checklist fallback.
  const { data: stdItems, error: stdErr } = await supabase
    .from('data_room_checklist_items')
    .select('name, category, is_required, position')
    .eq('company_id', companyId)
    .order('position', { ascending: true });

  if (stdErr || !stdItems || stdItems.length === 0) {
    return { inserted: 0, source: 'none', sourceLabel: '' };
  }

  // Dedup against existing items.
  const { data: existing } = await supabase
    .from('outstanding_items')
    .select('description, source_metadata, position')
    .eq('deal_id', dealId);

  const existingDesc = new Set<string>();
  const existingKeys = new Set<string>();
  let nextPosition = 0;
  for (const e of existing || []) {
    existingDesc.add(normalizeText((e as any).description));
    const meta = (e as any).source_metadata as Record<string, unknown> | null;
    if (meta?.source_item_key) existingKeys.add(`standard::${meta.source_item_key}`);
    if (typeof (e as any).position === 'number') {
      nextPosition = Math.max(nextPosition, (e as any).position + 1);
    }
  }

  const status = JSON.stringify({
    received: false,
    approved: false,
    deliveredToLenders: [],
    requestedBy: ['5th Line'],
  });

  const inserts: Array<Record<string, unknown>> = [];
  for (const item of stdItems) {
    const key = itemKey((item as any).name);
    if (existingKeys.has(`standard::${key}`)) continue;
    if (existingDesc.has(normalizeText((item as any).name))) continue;
    inserts.push({
      deal_id: dealId,
      description: (item as any).name,
      status,
      user_id: userId,
      priority: 'normal',
      position: nextPosition + inserts.length,
      notes: `Auto-created from Standard Checklist${(item as any).category ? ` — ${(item as any).category}` : ''}`,
      source_metadata: {
        source_type: 'standard_checklist',
        source_item_key: key,
        source_category: (item as any).category ?? null,
        source_required: !!(item as any).is_required,
      },
    });
  }

  if (inserts.length === 0) {
    return { inserted: 0, source: 'standard', sourceLabel: 'Standard Checklist' };
  }

  const { error: insertErr } = await supabase
    .from('outstanding_items')
    .insert(inserts as any);

  if (insertErr) {
    console.error('[applyDefaultChecklist] Standard insert failed:', insertErr);
    return { inserted: 0, source: 'standard', sourceLabel: 'Standard Checklist' };
  }

  return {
    inserted: inserts.length,
    source: 'standard',
    sourceLabel: 'Standard Checklist',
  };
}