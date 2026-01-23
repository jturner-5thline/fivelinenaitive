import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
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


const PINNED_FILTERS_KEY = 'deals-pinned-filters';
const DEFAULT_PINNED: FilterKey[] = ['stage', 'status'];

interface DealFiltersProps {
  filters: FilterType;
  onFilterChange: (filters: Partial<FilterType>) => void;
}

export function DealFilters({
  filters,
  onFilterChange,
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
    filters.lender.length > 0,
    filters.referredBy.length > 0,
    filters.staleOnly,
    filters.flaggedOnly,
  ].filter(Boolean).length;

  const clearFilters = () => {
    onFilterChange({
      search: '',
      stage: [],
      status: [],
      engagementType: [],
      manager: [],
      lender: [],
      referredBy: [],
      staleOnly: false,
      flaggedOnly: false,
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
      const label = STATUS_CONFIG[value as DealStatus]?.label || value;
      chips.push({ type: 'status', value, label });
    });

    filters.engagementType.forEach((value) => {
      const label = ENGAGEMENT_TYPE_CONFIG[value as EngagementType]?.label || value;
      chips.push({ type: 'engagementType', value, label });
    });

    filters.manager.forEach((value) => {
      chips.push({ type: 'manager', value, label: value });
    });

    filters.lender.forEach((value) => {
      chips.push({ type: 'lender', value, label: value });
    });

    filters.referredBy.forEach((value) => {
      const referrer = mockReferrers.find(r => r.id === value);
      chips.push({ type: 'referredBy', value, label: referrer?.name || value });
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
      case 'lender':
        return (values: string[]) => onFilterChange({ lender: values });
      case 'referredBy':
        return (values: string[]) => onFilterChange({ referredBy: values });
    }
  };

  const activeChips = getActiveFilterChips();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative w-full max-w-[180px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={filters.search}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            className="pl-9 h-9 transition-colors duration-200 hover:border-[hsl(292,46%,72%)]/60 hover:border-[1.5px] focus:border-[hsl(292,46%,72%)]/60"
          />
        </div>

        {/* Quick Filters (Pinned) */}
        {pinnedFilters.map((key) => (
          <MultiSelectFilter
            key={key}
            label={FILTER_LABELS[key]}
            options={filterConfigs[key]}
            selected={filters[key] as string[]}
            onChange={getFilterOnChange(key)}
            className="w-[130px]"
          />
        ))}

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

        {activeFiltersCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 h-9">
            <X className="h-4 w-4" />
            Clear ({activeFiltersCount})
          </Button>
        )}
      </div>

      {/* Active Filter Chips */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeChips.map((chip) => (
            <Badge
              key={`${chip.type}-${chip.value}`}
              variant="secondary"
              className="gap-1 pr-1"
            >
              {chip.label}
              <button
                onClick={() => removeFilter(chip.type, chip.value)}
                className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
