import { useState, useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DealFilters as FilterType } from '@/hooks/useDeals';
import { 
  DealStage, 
  DealStatus, 
  EngagementType,
  STAGE_CONFIG, 
  STATUS_CONFIG, 
  ENGAGEMENT_TYPE_CONFIG,
} from '@/types/deal';
import { mockReferrers } from '@/data/mockDeals';
import { FiltersPopover, FilterKey, FILTER_LABELS, useFilterConfigs } from './FiltersPopover';
import { MultiSelectFilter } from './MultiSelectFilter';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { useFirstTimeHints } from '@/hooks/useFirstTimeHints';
import { CollapsibleSearch } from './CollapsibleSearch';
// PipelineSelector consolidated into the Deals page "View" popover.


const PINNED_FILTERS_KEY = 'deals-pinned-filters';
const DEFAULT_PINNED: FilterKey[] = ['stage', 'status', 'manager'];

interface DealFiltersProps {
  filters: FilterType;
  onFilterChange: (filters: Partial<FilterType>) => void;
  /**
   * When true, the Status quick-filter chip is suppressed from the pinned
   * filter row (e.g. for the 5th Line Deal Rundown, where the "Active"
   * toggle takes its place).
   */
  hideStatusFilter?: boolean;
  /**
   * Optional slot rendered between the Search control and the FiltersPopover
   * (filter icon). Used by the Deals page to co-locate the "View" control
   * with the other left-group icon buttons.
   */
  afterSearchSlot?: ReactNode;
}

export function DealFilters({
  filters,
  onFilterChange,
  hideStatusFilter = false,
  afterSearchSlot,
}: DealFiltersProps) {
  const { isHintVisible, dismissHint } = useFirstTimeHints();
  const filterConfigs = useFilterConfigs();
  
  // Valid filter keys (used to clean up localStorage if it has stale keys)
  const validFilterKeys = Object.keys(filterConfigs) as FilterKey[];
  
  const [pinnedFilters, setPinnedFilters] = useState<FilterKey[]>(() => {
    const stored = localStorage.getItem(PINNED_FILTERS_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as FilterKey[];
        // Filter out any invalid keys that no longer exist
        return parsed.filter(key => validFilterKeys.includes(key));
      } catch {
        return DEFAULT_PINNED;
      }
    }
    return DEFAULT_PINNED;
  });

  useEffect(() => {
    localStorage.setItem(PINNED_FILTERS_KEY, JSON.stringify(pinnedFilters));
  }, [pinnedFilters]);

  const togglePin = (key: FilterKey) => {
    setPinnedFilters(prev => {
      if (prev.includes(key)) {
        return prev.filter(k => k !== key);
      }
      if (prev.length >= 4) return prev;
      return [...prev, key];
    });
  };

  const activeFiltersCount = [
    filters.stage.length > 0,
    filters.status.length > 0,
    filters.engagementType.length > 0,
    filters.manager.length > 0,
    filters.dealOwner.length > 0,
    filters.lender.length > 0,
    filters.referredBy.length > 0,
    filters.sourcedVia.length > 0,
    filters.staleOnly,
    filters.flaggedOnly,
    filters.hasNotificationsOnly,
    (filters.tasksFilter ?? 'all') !== 'all',
  ].filter(Boolean).length;

  const clearFilters = () => {
    onFilterChange({
      search: '',
      stage: [],
      status: [],
      engagementType: [],
      manager: [],
      dealOwner: [],
      lender: [],
      referredBy: [],
      sourcedVia: [],
      staleOnly: false,
      flaggedOnly: false,
      hasNotificationsOnly: false,
      tasksFilter: 'all',
    });
  };

  const removeFilter = (type: keyof FilterType, value: string) => {
    if (type === 'search') {
      onFilterChange({ search: '' });
    } else {
      const currentValues = filters[type] as string[];
      onFilterChange({ [type]: currentValues.filter((v) => v !== value) });
    }
  };

  const getActiveFilterChips = () => {
    const chips: { type: keyof FilterType; value: string; label: string }[] = [];

    filters.stage.forEach((value) => {
      const label = STAGE_CONFIG[value as DealStage]?.label || value;
      chips.push({ type: 'stage', value, label });
    });

    filters.status.forEach((value) => {
      const label = (value as string) === '__no_status__'
        ? 'No status'
        : (STATUS_CONFIG[value as DealStatus]?.label || value);
      chips.push({ type: 'status', value, label });
    });

    filters.engagementType.forEach((value) => {
      const label = ENGAGEMENT_TYPE_CONFIG[value as EngagementType]?.label || value;
      chips.push({ type: 'engagementType', value, label });
    });

    filters.manager.forEach((value) => {
      chips.push({ type: 'manager', value, label: value });
    });

    filters.dealOwner.forEach((value) => {
      chips.push({ type: 'dealOwner', value, label: value });
    });

    filters.lender.forEach((value) => {
      chips.push({ type: 'lender', value, label: value });
    });

    filters.referredBy.forEach((value) => {
      const referrer = mockReferrers.find(r => r.id === value);
      chips.push({ type: 'referredBy', value, label: referrer?.name || value });
    });

    filters.sourcedVia.forEach((value) => {
      chips.push({ type: 'sourcedVia', value, label: value });
    });

    return chips;
  };

  const getFilterOnChange = (key: FilterKey) => {
    switch (key) {
      case 'stage':
        return (values: string[]) => onFilterChange({ stage: values as DealStage[] });
      case 'status':
        return (values: string[]) => onFilterChange({ status: values as DealStatus[] });
      case 'engagementType':
        return (values: string[]) => onFilterChange({ engagementType: values as EngagementType[] });
      case 'manager':
        return (values: string[]) => onFilterChange({ manager: values });
      case 'dealOwner':
        return (values: string[]) => onFilterChange({ dealOwner: values });
      case 'lender':
        return (values: string[]) => onFilterChange({ lender: values });
      case 'referredBy':
        return (values: string[]) => onFilterChange({ referredBy: values });
      case 'sourcedVia':
        return (values: string[]) => onFilterChange({ sourcedVia: values });
    }
  };

  const activeChips = getActiveFilterChips();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <CollapsibleSearch
          value={filters.search}
          onChange={(value) => onFilterChange({ search: value })}
        />

        {afterSearchSlot}

        {/* Consolidated Filters Popover */}
        <HintTooltip
          hint="Use filters to quickly find deals by stage, status, manager, and more. Pin your favorites for quick access!"
          visible={isHintVisible('filters')}
          onDismiss={() => dismissHint('filters')}
          side="bottom"
          align="start"
          showDelay={2500}
        >
          <FiltersPopover
            filters={filters}
            onFilterChange={onFilterChange}
            activeFiltersCount={activeFiltersCount}
            pinnedFilters={pinnedFilters}
            onTogglePin={togglePin}
          />
        </HintTooltip>

        {/* Quick Filters (Pinned) */}
        {pinnedFilters
          .filter((key) => !(hideStatusFilter && key === 'status'))
          .map((key) => (
          <MultiSelectFilter
            key={key}
            label={FILTER_LABELS[key]}
            options={filterConfigs[key]}
            selected={filters[key] as string[]}
            onChange={getFilterOnChange(key)}
            className={key === 'stage' || key === 'status' ? 'w-[105px]' : 'w-[130px]'}
          />
        ))}

        {activeFiltersCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 h-9">
            <X className="h-4 w-4" />
            Clear ({activeFiltersCount})
          </Button>
        )}
      </div>
    </div>
  );
}
