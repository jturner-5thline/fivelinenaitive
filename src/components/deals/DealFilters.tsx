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
  MANAGERS,
  LENDERS,
} from '@/types/deal';
import { mockReferrers } from '@/data/mockDeals';
import { MultiSelectFilter } from './MultiSelectFilter';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { useFirstTimeHints } from '@/hooks/useFirstTimeHints';

interface DealFiltersProps {
  filters: FilterType;
  onFilterChange: (filters: Partial<FilterType>) => void;
}

export function DealFilters({
  filters,
  onFilterChange,
}: DealFiltersProps) {
  const { isHintVisible, dismissHint } = useFirstTimeHints();
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

  const stageOptions = Object.entries(STAGE_CONFIG).map(([key, { label }]) => ({
    value: key,
    label,
  }));

  const statusOptions = Object.entries(STATUS_CONFIG).map(([key, { label }]) => ({
    value: key,
    label,
  }));

  const engagementTypeOptions = Object.entries(ENGAGEMENT_TYPE_CONFIG).map(([key, { label }]) => ({
    value: key,
    label,
  }));

  const managerOptions = MANAGERS.map((manager) => ({
    value: manager,
    label: manager,
  }));

  const lenderOptions = LENDERS.map((lender) => ({
    value: lender,
    label: lender,
  }));

  const referredByOptions = mockReferrers.map((referrer) => ({
    value: referrer.id,
    label: referrer.name,
  }));

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

  const activeChips = getActiveFilterChips();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        {/* Search */}
        <div className="relative w-full max-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={filters.search}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            className="pl-9 transition-colors duration-200 hover:border-[hsl(292,46%,72%)]/60 hover:border-[1.5px] focus:border-[hsl(292,46%,72%)]/60"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <HintTooltip
            hint="Use these filters to quickly find deals by stage, status, manager, and more."
            visible={isHintVisible('filters')}
            onDismiss={() => dismissHint('filters')}
            side="bottom"
            align="start"
            showDelay={2500}
          >
            <MultiSelectFilter
              label="Stages"
              options={stageOptions}
              selected={filters.stage}
              onChange={(stage) => onFilterChange({ stage: stage as DealStage[] })}
              className="w-[150px]"
            />
          </HintTooltip>

          <MultiSelectFilter
            label="Statuses"
            options={statusOptions}
            selected={filters.status}
            onChange={(status) => onFilterChange({ status: status as DealStatus[] })}
            className="w-[140px]"
          />

          <MultiSelectFilter
            label="Type"
            options={engagementTypeOptions}
            selected={filters.engagementType}
            onChange={(engagementType) => onFilterChange({ engagementType: engagementType as EngagementType[] })}
            className="w-[170px]"
          />

          <MultiSelectFilter
            label="Managers"
            options={managerOptions}
            selected={filters.manager}
            onChange={(manager) => onFilterChange({ manager })}
            className="w-[150px]"
          />

          <MultiSelectFilter
            label="Lenders"
            options={lenderOptions}
            selected={filters.lender}
            onChange={(lender) => onFilterChange({ lender })}
            className="w-[160px]"
          />

          <MultiSelectFilter
            label="Referred by"
            options={referredByOptions}
            selected={filters.referredBy}
            onChange={(referredBy) => onFilterChange({ referredBy })}
            className="w-[160px]"
          />


          {activeFiltersCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
              <X className="h-4 w-4" />
              Clear ({activeFiltersCount})
            </Button>
          )}
        </div>
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
