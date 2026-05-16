import { useMemo, useState, useCallback } from 'react';
import { Deal } from '@/types/deal';
import { DealStageOption } from '@/contexts/DealStagesContext';

export type NaitiveFilterKey = 'owner' | 'icp' | 'stage' | 'source' | 'outcome';

export type NaitiveDateRangePreset = 'all' | 'last30' | 'last90' | 'thisYear';
export type NaitiveDateField = 'created' | 'closing';

export interface NaitivePipelineFilterState {
  owner: string[];
  icp: string[];
  stage: string[];
  source: string[];
  outcome: string[];
  dateRange: NaitiveDateRangePreset;
  dateField: NaitiveDateField;
  activeOnly: boolean;
}

const EMPTY: NaitivePipelineFilterState = {
  owner: [],
  icp: [],
  stage: [],
  source: [],
  outcome: [],
  dateRange: 'all',
  dateField: 'created',
  activeOnly: false,
};

export interface NaitiveFilterOption {
  value: string;   // stable id (stage = stage id, others = lowercased value)
  label: string;   // display label
}

function pushOpt(map: Map<string, string>, raw: string | undefined | null) {
  if (!raw) return;
  const label = String(raw).trim();
  if (!label) return;
  const value = label.toLowerCase();
  if (!map.has(value)) map.set(value, label);
}

export function useNaitivePipelineFilters(deals: Deal[], stages: DealStageOption[]) {
  const [filters, setFilters] = useState<NaitivePipelineFilterState>(EMPTY);

  // ── Build distinct option lists from the dataset ──────────────────────
  const options = useMemo(() => {
    const owners = new Map<string, string>();
    const icps = new Map<string, string>();
    const sources = new Map<string, string>();
    const outcomes = new Map<string, string>();

    for (const d of deals) {
      pushOpt(owners, d.dealOwner || d.ownedBy || d.manager);
      pushOpt(icps, d.icpCategory);
      pushOpt(sources, d.sourcedVia || d.leadSource || d.referralSource);
      pushOpt(outcomes, d.outcome || (d.status === 'archived' ? 'Archived' : null));
    }

    const toSorted = (m: Map<string, string>): NaitiveFilterOption[] =>
      Array.from(m, ([value, label]) => ({ value, label })).sort((a, b) =>
        a.label.localeCompare(b.label),
      );

    const stageOpts: NaitiveFilterOption[] = stages.map((s) => ({
      value: s.id,
      label: s.label,
    }));

    return {
      owner: toSorted(owners),
      icp: toSorted(icps),
      stage: stageOpts,
      source: toSorted(sources),
      outcome: toSorted(outcomes),
    };
  }, [deals, stages]);

  // Stage IDs at or after "Final Credit Items" in the active pipeline order.
  const activeStageIds = useMemo(() => {
    const idx = stages.findIndex(
      (s) => (s.label || '').trim().toLowerCase() === 'final credit items',
    );
    if (idx < 0) return new Set<string>();
    return new Set(stages.slice(idx).map((s) => s.id));
  }, [stages]);

  // ── Apply filters ─────────────────────────────────────────────────────
  const apply = useCallback(
    (input: Deal[]): Deal[] => {
      const f = filters;
      const hasOwner = f.owner.length > 0;
      const hasIcp = f.icp.length > 0;
      const hasStage = f.stage.length > 0;
      const hasSource = f.source.length > 0;
      const hasOutcome = f.outcome.length > 0;

      // Date range cutoff (null = no cutoff)
      let cutoff: number | null = null;
      const now = Date.now();
      if (f.dateRange === 'last30') cutoff = now - 30 * 86400_000;
      else if (f.dateRange === 'last90') cutoff = now - 90 * 86400_000;
      else if (f.dateRange === 'thisYear') {
        cutoff = new Date(new Date().getFullYear(), 0, 1).getTime();
      }

      const lc = (v: unknown) => String(v ?? '').trim().toLowerCase();

      return input.filter((d) => {
        if (f.activeOnly) {
          if (!activeStageIds.has(d.stage)) return false;
        }
        if (hasOwner) {
          const v = lc(d.dealOwner || d.ownedBy || d.manager);
          if (!f.owner.includes(v)) return false;
        }
        if (hasIcp) {
          if (!f.icp.includes(lc(d.icpCategory))) return false;
        }
        if (hasStage) {
          if (!f.stage.includes(d.stage)) return false;
        }
        if (hasSource) {
          const v = lc(d.sourcedVia || d.leadSource || d.referralSource);
          if (!f.source.includes(v)) return false;
        }
        if (hasOutcome) {
          const v = lc(d.outcome || (d.status === 'archived' ? 'Archived' : ''));
          if (!f.outcome.includes(v)) return false;
        }
        if (cutoff != null) {
          const raw = f.dateField === 'closing' ? d.closingDate : d.createdAt;
          if (!raw) return false;
          const t = new Date(raw).getTime();
          if (Number.isNaN(t) || t < cutoff) return false;
        }
        return true;
      });
    },
    [filters, activeStageIds],
  );

  const setMulti = useCallback((key: NaitiveFilterKey, values: string[]) => {
    setFilters((prev) => ({ ...prev, [key]: values }));
  }, []);

  const setDateRange = useCallback((dateRange: NaitiveDateRangePreset) => {
    setFilters((prev) => ({ ...prev, dateRange }));
  }, []);

  const setDateField = useCallback((dateField: NaitiveDateField) => {
    setFilters((prev) => ({ ...prev, dateField }));
  }, []);

  const setActiveOnly = useCallback((activeOnly: boolean) => {
    setFilters((prev) => ({ ...prev, activeOnly }));
  }, []);

  const clearAll = useCallback(() => setFilters(EMPTY), []);

  const activeCount = useMemo(() => {
    let n =
      filters.owner.length +
      filters.icp.length +
      filters.stage.length +
      filters.source.length +
      filters.outcome.length;
    if (filters.dateRange !== 'all') n += 1;
    if (filters.activeOnly) n += 1;
    return n;
  }, [filters]);

  return {
    filters,
    options,
    apply,
    setMulti,
    setDateRange,
    setDateField,
    setActiveOnly,
    activeStageIds,
    clearAll,
    activeCount,
  };
}
