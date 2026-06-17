import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// ── Data model ──────────────────────────────────────────────

export interface ChecklistItemConfig {
  id: string;
  label: string;
  description?: string;
  order: number;
  required: boolean;
}

export interface RoundConfig {
  id: string;
  title: string;
  order: number;
  items: ChecklistItemConfig[];
}

export interface DealTypeChecklistConfig {
  id: string;
  dealTypeMatchString: string;
  rounds: RoundConfig[];
}

/** Top-level shape stored in company_settings.data_room_default_checklists */
export interface DefaultChecklistConfigV2 {
  version: 2;
  configs: DealTypeChecklistConfig[];
}

// Legacy shape for migration
export interface DefaultChecklistEntry {
  name: string;
  category: string;
  is_required: boolean;
  description?: string;
}

export interface DefaultChecklistConfig {
  [dealTypeId: string]: {
    label: string;
    items: DefaultChecklistEntry[];
  };
}

// ── Helpers ─────────────────────────────────────────────────

let _idCounter = 0;
export function genId(): string {
  return `${Date.now()}-${++_idCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Migrate legacy flat config → v2 rounds-based config */
function migrateLegacy(legacy: DefaultChecklistConfig): DefaultChecklistConfigV2 {
  const configs: DealTypeChecklistConfig[] = Object.entries(legacy).map(([, val]) => ({
    id: genId(),
    dealTypeMatchString: String(val?.label ?? ''),
    rounds: [{
      id: genId(),
      title: 'Initial Items',
      order: 0,
      items: (val.items || []).map((item, idx) => ({
        id: genId(),
        label: item.name,
        description: item.description,
        order: idx,
        required: item.is_required,
      })),
    }],
  }));
  return { version: 2, configs };
}

function sanitizeV2Config(rawConfigs: unknown): DefaultChecklistConfigV2 {
  const configs = Array.isArray(rawConfigs) ? rawConfigs : [];
  return {
    version: 2,
    configs: configs
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
      .filter((c) => typeof c.dealTypeMatchString === 'string' && c.dealTypeMatchString.trim().length > 0)
      .map((c) => ({
        id: typeof c.id === 'string' ? c.id : genId(),
        dealTypeMatchString: c.dealTypeMatchString as string,
        rounds: (Array.isArray(c.rounds) ? c.rounds : [])
          .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
          .map((r, roundIdx) => ({
            id: typeof r.id === 'string' ? r.id : genId(),
            title: String(r.title ?? `Round ${roundIdx + 1}`),
            order: typeof r.order === 'number' ? r.order : roundIdx,
            items: (Array.isArray(r.items) ? r.items : [])
              .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
              .map((item, itemIdx) => ({
                id: typeof item.id === 'string' ? item.id : genId(),
                label: String(item.label ?? item.name ?? ''),
                description: typeof item.description === 'string' ? item.description : undefined,
                order: typeof item.order === 'number' ? item.order : itemIdx,
                required: Boolean(item.required ?? item.is_required),
              }))
              .filter((item) => item.label.trim().length > 0),
          })),
      })),
  };
}

function parseConfig(raw: unknown): DefaultChecklistConfigV2 {
  if (!raw) return { version: 2, configs: [] };
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(raw)) return { version: 2, configs: [] };
  if (obj.version === 2 || Array.isArray(obj.configs)) return sanitizeV2Config(obj.configs);
  // Legacy format
  return migrateLegacy(raw as DefaultChecklistConfig);
}

/** Normalize text for matching: lowercase, strip non-alphanumeric except spaces, collapse spaces */
function normalizeForMatch(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Find config for a deal type by exact match (case-insensitive, punctuation-resilient) against configured Deal Types. */
export function findMatchingConfig(
  configs: DealTypeChecklistConfig[],
  dealTypeText: string,
): DealTypeChecklistConfig | null {
  if (!dealTypeText) return null;
  const normalized = normalizeForMatch(dealTypeText);
  return configs.find(c => {
    if (!c || typeof c.dealTypeMatchString !== 'string' || !c.dealTypeMatchString.trim()) return false;
    if (!Array.isArray(c.rounds)) return false;
    return normalizeForMatch(c.dealTypeMatchString) === normalized;
  }) || null;
}

// ── Seed data ───────────────────────────────────────────────

export function getDefaultSeedConfig(): DefaultChecklistConfigV2 {
  return {
    version: 2,
    configs: [
      {
        id: genId(),
        dealTypeMatchString: 'Growth Capital',
        rounds: [
          {
            id: genId(),
            title: 'Initial Items',
            order: 0,
            items: [
              { id: genId(), label: 'Pitch Deck', order: 0, required: true },
              { id: genId(), label: 'Financial Projections/Model - P&L, BS and/or CashFlow', order: 1, required: true },
              { id: genId(), label: 'Monthly YTD P&L, BS & Cash Flow', order: 2, required: true },
              { id: genId(), label: '2024 and 2025 Monthly P&L and BS', order: 3, required: true },
            ],
          },
          {
            id: genId(),
            title: 'Kick Off',
            order: 1,
            items: [
              { id: genId(), label: 'Detailed Cap Table', order: 0, required: false },
              { id: genId(), label: 'KPI Dashboard', order: 1, required: false },
              { id: genId(), label: 'Sample Customer Contract', order: 2, required: false },
              { id: genId(), label: 'Debt Schedule and Terms', order: 3, required: false },
              { id: genId(), label: 'Latest Sales Pipeline', order: 4, required: false },
              { id: genId(), label: 'Revenue by Customer by Month', order: 5, required: false },
              { id: genId(), label: 'Key Metrics & KPIs', order: 6, required: false },
              { id: genId(), label: 'Audits, if available', order: 7, required: false },
            ],
          },
        ],
      },
      {
        id: genId(),
        dealTypeMatchString: 'ABL',
        rounds: [
          {
            id: genId(),
            title: 'Initial Items',
            order: 0,
            items: [
              { id: genId(), label: 'Pitch Deck', order: 0, required: true },
              { id: genId(), label: 'Financial Projections/Model - P&L, BS and/or CashFlow', order: 1, required: true },
              { id: genId(), label: 'Monthly YTD P&L, BS & Cash Flow', order: 2, required: true },
              { id: genId(), label: '2024 and 2025 Monthly P&L and BS', order: 3, required: true },
            ],
          },
          {
            id: genId(),
            title: 'Kick Off',
            order: 1,
            items: [
              { id: genId(), label: 'Detailed Cap Table', order: 0, required: false },
              { id: genId(), label: 'A/P and A/R Aging', order: 1, required: false },
              { id: genId(), label: 'Inventory Report', order: 2, required: false },
              { id: genId(), label: 'Tax Returns', order: 3, required: false },
              { id: genId(), label: 'Customer List', order: 4, required: false },
              { id: genId(), label: 'Any Lease Agreements', order: 5, required: false },
              { id: genId(), label: 'Past 3 Months Bank Statements', order: 6, required: false },
              { id: genId(), label: 'Sample Customer Contract', order: 7, required: false },
              { id: genId(), label: 'Sample PO / Invoice', order: 8, required: false },
              { id: genId(), label: 'Debt Schedule & Terms', order: 9, required: false },
            ],
          },
        ],
      },
      {
        id: genId(),
        dealTypeMatchString: 'CapEx',
        rounds: [
          {
            id: genId(),
            title: 'Initial Items',
            order: 0,
            items: [
              { id: genId(), label: 'Pitch Deck', order: 0, required: true },
              { id: genId(), label: 'Financial Projections/Model - P&L, BS and/or CashFlow', order: 1, required: true },
              { id: genId(), label: 'Monthly YTD P&L, BS & Cash Flow', order: 2, required: true },
              { id: genId(), label: '2024 and 2025 Monthly P&L and BS', order: 3, required: true },
            ],
          },
          {
            id: genId(),
            title: 'Kick Off',
            order: 1,
            items: [
              { id: genId(), label: 'Detailed Cap Table', order: 0, required: false },
              { id: genId(), label: 'KPI Dashboard', order: 1, required: false },
              { id: genId(), label: 'CapEx List (Template-Based)', order: 2, required: false },
              { id: genId(), label: 'Sample Equipment Invoices', order: 3, required: false },
              { id: genId(), label: 'Sample Customer Contract', order: 4, required: false },
              { id: genId(), label: 'Debt Schedule and Terms', order: 5, required: false },
              { id: genId(), label: 'Latest Sales Pipeline', order: 6, required: false },
              { id: genId(), label: 'Revenue by Customer by Month', order: 7, required: false },
              { id: genId(), label: 'MRR by Customer & KPIs', order: 8, required: false },
            ],
          },
        ],
      },
    ],
  };
}

// ── Hook ────────────────────────────────────────────────────

export function useDefaultChecklistConfig(companyId: string | undefined) {
  const { user } = useAuth();
  const [config, setConfig] = useState<DefaultChecklistConfigV2>({ version: 2, configs: [] });
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    if (!user || !companyId) { setLoading(false); return; }
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('data_room_default_checklists')
        .eq('company_id', companyId)
        .maybeSingle();

      if (error) throw error;
      setConfig(parseConfig(data?.data_room_default_checklists));
    } catch (err) {
      console.error('Error fetching default checklist config:', err);
    } finally {
      setLoading(false);
    }
  }, [user, companyId]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const saveConfig = useCallback(async (newConfig: DefaultChecklistConfigV2) => {
    if (!user || !companyId) return false;
    try {
      const { error } = await supabase
        .from('company_settings')
        .update({ data_room_default_checklists: newConfig as any })
        .eq('company_id', companyId);

      if (error) throw error;
      setConfig(newConfig);
      toast.success('Default checklist configuration saved');
      return true;
    } catch (err) {
      console.error('Error saving default checklist config:', err);
      toast.error('Failed to save configuration');
      return false;
    }
  }, [user, companyId]);

  return { config, loading, saveConfig, refetch: fetchConfig };
}

// ── Populate helper ─────────────────────────────────────────

/** Populate deal checklist items from the matching config for a deal's types */
export async function populateDefaultChecklist(
  dealId: string,
  dealTypeText: string,
  companyId: string,
  userId: string,
): Promise<number> {
  try {
    // Fetch the config
    const { data, error } = await supabase
      .from('company_settings')
      .select('data_room_default_checklists')
      .eq('company_id', companyId)
      .maybeSingle();

    if (error) throw error;
    const parsed = parseConfig(data?.data_room_default_checklists);
    const matched = findMatchingConfig(parsed.configs, dealTypeText);
    if (!matched || !matched.rounds.length) return 0;

    // Check if deal already has checklist items
    const { count } = await supabase
      .from('deal_checklist_items')
      .select('id', { count: 'exact', head: true })
      .eq('deal_id', dealId);

    if (count && count > 0) return 0; // Already populated

    // Flatten rounds into items, using round title as category
    const items: {
      deal_id: string;
      name: string;
      category: string | null;
      description: string | null;
      is_required: boolean;
      position: number;
      created_by: string;
    }[] = [];

    let position = 0;
    for (const round of [...matched.rounds].sort((a, b) => a.order - b.order)) {
      for (const item of [...round.items].sort((a, b) => a.order - b.order)) {
        items.push({
          deal_id: dealId,
          name: item.label,
          category: round.title,
          description: item.description || null,
          is_required: item.required,
          position: position++,
          created_by: userId,
        });
      }
    }

    if (!items.length) return 0;

    const { error: insertError } = await supabase
      .from('deal_checklist_items')
      .insert(items);

    if (insertError) throw insertError;
    return items.length;
  } catch (err) {
    console.error('Error populating default checklist:', err);
    return 0;
  }
}
